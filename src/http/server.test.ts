import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

import type { Critic } from "../agents/critic.js";
import type {
  ReasoningStrategy,
  StrategyOptions,
  StrategyResult,
} from "../agents/strategy.js";
import { ChatTimeoutError } from "../domain/errors.js";
import { createApp } from "./server.js";

type CallLog = {
  message: string;
  options: StrategyOptions;
};

function makeFake(
  name: "react" | "plan-and-execute",
  calls: CallLog[],
  answerPrefix = name,
): ReasoningStrategy {
  return {
    name,
    async run(message: string, options: StrategyOptions): Promise<StrategyResult> {
      calls.push({ message, options });
      const answer = `${answerPrefix}:${message}`;
      return {
        answer,
        trace: [{ type: "answer", content: answer }],
        metrics: { llmCalls: 0, latencyMs: 1 },
      };
    },
  };
}

function makeNeverSettling(name: "react" | "plan-and-execute"): ReasoningStrategy {
  return {
    name,
    run() {
      return new Promise(() => undefined);
    },
  };
}

function approvingCritic(calls: { count: number }): Critic {
  return {
    async evaluate() {
      calls.count += 1;
      return { approved: true, feedback: "ok", llmCalls: 0 };
    },
  };
}

async function listen(
  app: ReturnType<typeof createApp>,
): Promise<{ baseUrl: string; server: Server }> {
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function postJson(
  baseUrl: string,
  body: unknown,
  init?: { raw?: string; contentType?: string },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": init?.contentType ?? "application/json",
    },
    body: init?.raw ?? JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json };
}

const reactCalls: CallLog[] = [];
const planCalls: CallLog[] = [];
const criticCalls = { count: 0 };

const reactFake = makeFake("react", reactCalls);
const planFake = makeFake("plan-and-execute", planCalls);
const critic = approvingCritic(criticCalls);

let baseUrl = "";
let server: Server;

before(async () => {
  const started = await listen(
    createApp({
      registry: {
        react: reactFake,
        "plan-and-execute": planFake,
      },
      critic,
      timeoutMs: 180_000,
    }),
  );
  baseUrl = started.baseUrl;
  server = started.server;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("POST /chat with only message returns 200 and reuses the same answer", async () => {
  reactCalls.length = 0;
  criticCalls.count = 0;

  const first = await postJson(baseUrl, { message: "listar alertas" });
  const second = await postJson(baseUrl, { message: "listar alertas" });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.json.answer, "react:listar alertas");
  assert.equal(second.json.answer, first.json.answer);
  assert.ok(Array.isArray(first.json.trace));
  assert.ok(first.json.metrics && typeof first.json.metrics === "object");
  assert.equal(reactCalls.length, 2);
  assert.equal(reactCalls[0]!.options.maxIterations, 8);
  assert.equal(criticCalls.count, 0);
});

test("two posts with different messages do not share answer", async () => {
  const a = await postJson(baseUrl, { message: "pedido-a" });
  const b = await postJson(baseUrl, { message: "pedido-b" });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.json.answer, b.json.answer);
});

test("plan-and-execute without reflect runs only that fake", async () => {
  planCalls.length = 0;
  reactCalls.length = 0;
  criticCalls.count = 0;

  const result = await postJson(baseUrl, {
    message: "abrir incidente",
    strategy: "plan-and-execute",
    reflect: false,
  });

  assert.equal(result.status, 200);
  assert.equal(result.json.answer, "plan-and-execute:abrir incidente");
  assert.equal(planCalls.length, 1);
  assert.equal(reactCalls.length, 0);
  assert.equal(criticCalls.count, 0);
});

test("reflect true wraps react and adds critique", async () => {
  criticCalls.count = 0;
  const result = await postJson(baseUrl, {
    message: "com reflexao",
    strategy: "react",
    reflect: true,
  });

  assert.equal(result.status, 200);
  assert.equal(criticCalls.count, 1);
  const trace = result.json.trace as Array<{ type: string }>;
  assert.ok(trace.some((event) => event.type === "critique"));
});

test("omitted strategy with reflect true wraps react", async () => {
  criticCalls.count = 0;
  const result = await postJson(baseUrl, {
    message: "padrao com reflect",
    reflect: true,
  });
  assert.equal(result.status, 200);
  assert.equal(criticCalls.count, 1);
  assert.match(String(result.json.answer), /^react:/);
});

test("omitted reflect does not call the critic", async () => {
  criticCalls.count = 0;
  const result = await postJson(baseUrl, {
    message: "sem reflect",
    strategy: "react",
  });
  assert.equal(result.status, 200);
  assert.equal(criticCalls.count, 0);
  const trace = result.json.trace as Array<{ type: string }>;
  assert.ok(!trace.some((event) => event.type === "critique"));
});

test("missing message returns 400 with issues", async () => {
  const before = reactCalls.length;
  const result = await postJson(baseUrl, { strategy: "react" });
  assert.equal(result.status, 400);
  assert.ok(Array.isArray(result.json.issues));
  const issues = result.json.issues as Array<{ path: unknown[] }>;
  assert.ok(issues.some((issue) => issue.path.includes("message")));
  assert.equal(reactCalls.length, before);
});

test("wrong types return 400 with one issue per failure", async () => {
  const before = reactCalls.length;
  const result = await postJson(baseUrl, {
    message: null,
    strategy: 1,
    reflect: "yes",
  });
  assert.equal(result.status, 400);
  const issues = result.json.issues as unknown[];
  assert.ok(issues.length >= 3);
  assert.equal(reactCalls.length, before);
});

test("invalid JSON returns 400 with fixed issues message", async () => {
  const before = reactCalls.length;
  const result = await postJson(baseUrl, null, {
    raw: "{not-json",
  });
  assert.equal(result.status, 400);
  assert.deepEqual(result.json.issues, [
    { path: [], message: "JSON inválido." },
  ]);
  assert.equal(reactCalls.length, before);
});

test("extra keys are ignored when message is valid", async () => {
  const result = await postJson(baseUrl, {
    message: "com extra",
    foo: "bar",
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.answer, "react:com extra");
});

test("empty strategy string is 422 not 400", async () => {
  const before = reactCalls.length;
  const result = await postJson(baseUrl, {
    message: "x",
    strategy: "",
  });
  assert.equal(result.status, 422);
  assert.equal(result.json.message, "Estratégia desconhecida: .");
  assert.equal(result.json.issues, undefined);
  assert.equal(reactCalls.length, before);
});

test("reflect:react is unknown even with reflect true", async () => {
  const beforeRuns = reactCalls.length;
  const beforeCritic = criticCalls.count;
  const result = await postJson(baseUrl, {
    message: "oi",
    strategy: "reflect:react",
    reflect: true,
  });
  assert.equal(result.status, 422);
  assert.equal(
    result.json.message,
    "Estratégia desconhecida: reflect:react.",
  );
  assert.equal(result.json.issues, undefined);
  assert.equal(reactCalls.length, beforeRuns);
  assert.equal(criticCalls.count, beforeCritic);
});

test("React casing is unknown", async () => {
  const result = await postJson(baseUrl, {
    message: "oi",
    strategy: "React",
  });
  assert.equal(result.status, 422);
  assert.equal(result.json.message, "Estratégia desconhecida: React.");
});

test("ChatTimeoutError message for 180000", () => {
  assert.equal(
    new ChatTimeoutError(180_000).message,
    "Tempo esgotado: a resposta não ficou pronta em 180 segundos.",
  );
});

test("short timeout with never-settling fake returns 504", async () => {
  const hanging = await listen(
    createApp({
      registry: {
        react: makeNeverSettling("react"),
        "plan-and-execute": makeNeverSettling("plan-and-execute"),
      },
      critic,
      timeoutMs: 30,
    }),
  );

  try {
    const result = await postJson(hanging.baseUrl, { message: "espera" });
    assert.equal(result.status, 504);
    assert.match(String(result.json.message), /0\.03 segundos/);
    assert.equal(result.json.answer, undefined);
    assert.equal(result.json.trace, undefined);
    assert.equal(result.json.metrics, undefined);

    const withReflect = await postJson(hanging.baseUrl, {
      message: "espera reflect",
      reflect: true,
    });
    assert.equal(withReflect.status, 504);
  } finally {
    await new Promise<void>((resolve, reject) => {
      hanging.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("fast fake still returns 200 under short timeout", async () => {
  const fastCalls: CallLog[] = [];
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", fastCalls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      critic,
      timeoutMs: 30,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "rapido" });
    assert.equal(result.status, 200);
    assert.equal(result.json.answer, "react:rapido");
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
