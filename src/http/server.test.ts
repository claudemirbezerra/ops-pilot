import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

import type { Critic } from "../agents/critic.js";
import {
  EMPTY_INPUT_ANSWER,
  type ReasoningStrategy,
  type StrategyOptions,
  type StrategyResult,
} from "../agents/strategy.js";
import { ChatTimeoutError } from "../domain/errors.js";
import type { Embedder } from "../domain/types.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { EMBEDDING_DIMS } from "../memory/similarity.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { createApp } from "./server.js";

function unitAt(index: number): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMS);
  vector[index] = 1;
  return vector;
}

function fakeMemoryStore(
  map: Record<string, Float32Array> = {},
): SqliteMemoryStore {
  const embedder: Embedder = {
    async embed(text: string): Promise<Float32Array> {
      return map[text] ?? unitAt(0);
    },
  };
  return new SqliteMemoryStore(":memory:", embedder);
}

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
const sharedStore = new SqliteConversationStore(":memory:");
const sharedMemory = fakeMemoryStore();

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
      conversationStore: sharedStore,
      memoryStore: sharedMemory,
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
  assert.equal(first.json.answer, "react:Plantonista: listar alertas");
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
  assert.equal(result.json.answer, "plan-and-execute:Plantonista: abrir incidente");
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
  assert.equal(result.json.answer, "react:Plantonista: com extra");
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
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
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
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "rapido" });
    assert.equal(result.status, 200);
    assert.equal(result.json.answer, "react:Plantonista: rapido");
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("new conversation returns an id and the fake still sees the raw message", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const first = await postJson(started.baseUrl, { message: "primeiro" });
    const second = await postJson(started.baseUrl, {
      message: "segundo",
      conversationId: first.json.conversationId,
    });
    const other = await postJson(started.baseUrl, { message: "outro fio" });

    assert.equal(first.status, 200);
    assert.equal(typeof first.json.conversationId, "string");
    assert.ok(String(first.json.conversationId).length > 0);
    assert.equal(calls[0]?.message, "Plantonista: primeiro");
    assert.equal(second.status, 200);
    assert.equal(second.json.conversationId, first.json.conversationId);
    assert.notEqual(other.json.conversationId, first.json.conversationId);

    const id = String(first.json.conversationId);
    assert.deepEqual(store.lastMessages(id, 12), [
      { role: "user", content: "primeiro" },
      { role: "assistant", content: first.json.answer },
      { role: "user", content: "segundo" },
      { role: "assistant", content: second.json.answer },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("invalid conversationId is 400 and does not call the fake", async () => {
  const calls: CallLog[] = [];
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    for (const conversationId of [1, null, "", "   "]) {
      const result = await postJson(started.baseUrl, {
        message: "oi",
        conversationId,
      });
      assert.equal(result.status, 400);
      const issues = result.json.issues as Array<{ path: unknown[] }>;
      assert.ok(issues.some((issue) => issue.path.includes("conversationId")));
    }
    assert.equal(calls.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function historyMessagesOf(json: Record<string, unknown>): unknown {
  const metrics = json.metrics as { historyMessages?: unknown } | undefined;
  return metrics?.historyMessages;
}

test("first turn reports one history message and the labeled prompt", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const first = await postJson(started.baseUrl, { message: "um" });
    assert.equal(first.status, 200);
    assert.equal(historyMessagesOf(first.json), 1);
    assert.equal(calls[0]?.message, "Plantonista: um");
    const metrics = first.json.metrics as { llmCalls: number; latencyMs: number };
    assert.equal(typeof metrics.llmCalls, "number");
    assert.equal(typeof metrics.latencyMs, "number");

    const second = await postJson(started.baseUrl, {
      message: "dois",
      conversationId: first.json.conversationId,
    });
    assert.equal(historyMessagesOf(second.json), 3);
    assert.match(String(calls[1]?.message), /Plantonista: um/);
    assert.match(String(calls[1]?.message), /Copiloto: react:Plantonista: um/);
    assert.match(String(calls[1]?.message), /Plantonista: dois$/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("prompt keeps only the 12 newest messages", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const id = store.create();
  for (let index = 0; index < 12; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "novo",
      conversationId: id,
    });
    assert.equal(result.status, 200);
    assert.equal(historyMessagesOf(result.json), 12);
    const lines = String(calls[0]?.message).split("\n");
    assert.equal(lines.length, 12);
    assert.equal(lines[0], "Copiloto: m1");
    assert.equal(lines.at(-1), "Plantonista: novo");
    assert.equal(String(calls[0]?.message).includes("m0"), false);
    assert.equal(
      store.lastMessages(id, 30).some((message) => message.content === "m0"),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("reflection counts historyMessages once", async () => {
  const localCritic = { count: 0 };
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      critic: approvingCritic(localCritic),
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "nova",
      reflect: true,
    });
    assert.equal(result.status, 200);
    assert.equal(historyMessagesOf(result.json), 1);
    assert.equal(localCritic.count, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function countTable(
  store: SqliteConversationStore,
  table: "conversations" | "messages",
): number {
  const row = store.database
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .get() as { n: number };
  return Number(row.n);
}

async function closeServer(active: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    active.close((error) => (error ? reject(error) : resolve()));
  });
}

test("unknown conversationId is 404 and does not run or persist", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "oi",
      conversationId: "nao-existe",
    });
    assert.equal(result.status, 404);
    assert.equal(result.json.message, "Conversa desconhecida: nao-existe.");
    assert.equal(result.json.answer, undefined);
    assert.equal(result.json.trace, undefined);
    assert.equal(result.json.metrics, undefined);
    assert.equal(result.json.conversationId, undefined);
    assert.equal(calls.length, 0);
    assert.equal(countTable(store, "conversations"), 0);
    assert.equal(countTable(store, "messages"), 0);
  } finally {
    await closeServer(started.server);
  }
});

test("unknown strategy wins over an unknown conversationId", async () => {
  const calls: CallLog[] = [];
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "oi",
      strategy: "nope",
      conversationId: "nao-existe",
    });
    assert.equal(result.status, 422);
    assert.equal(calls.length, 0);
  } finally {
    await closeServer(started.server);
  }
});

test("blank message does not persist and skips the strategy", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const existingId = store.create();
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const fresh = await postJson(started.baseUrl, { message: "   " });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.json.answer, EMPTY_INPUT_ANSWER);
    assert.equal(historyMessagesOf(fresh.json), 0);
    assert.equal(fresh.json.conversationId, undefined);
    assert.equal(calls.length, 0);

    const echoed = await postJson(started.baseUrl, {
      message: "   ",
      conversationId: existingId,
    });
    assert.equal(echoed.status, 200);
    assert.equal(echoed.json.conversationId, existingId);
    assert.equal(historyMessagesOf(echoed.json), 0);
    assert.deepEqual(store.lastMessages(existingId, 12), []);

    const missing = await postJson(started.baseUrl, {
      message: "   ",
      conversationId: "nao-existe",
    });
    assert.equal(missing.status, 404);

    const unknownStrategy = await postJson(started.baseUrl, {
      message: "   ",
      strategy: "nope",
    });
    assert.equal(unknownStrategy.status, 422);
    assert.equal(calls.length, 0);
    assert.equal(countTable(store, "messages"), 0);
  } finally {
    await closeServer(started.server);
  }
});

test("timeout does not create a conversation", async () => {
  const store = new SqliteConversationStore(":memory:");
  const started = await listen(
    createApp({
      registry: {
        react: makeNeverSettling("react"),
        "plan-and-execute": makeNeverSettling("plan-and-execute"),
      },
      timeoutMs: 30,
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "espera" });
    assert.equal(result.status, 504);
    assert.equal(result.json.conversationId, undefined);
    assert.equal(countTable(store, "conversations"), 0);
    assert.equal(countTable(store, "messages"), 0);
  } finally {
    await closeServer(started.server);
  }
});

test("POST /chat with userId injects recalled memory into the prompt", async () => {
  const calls: CallLog[] = [];
  const fact = "o cluster de pagamentos é o azul";
  const memory = fakeMemoryStore({
    [fact]: unitAt(8),
    "qual cor?": unitAt(8),
  });
  await memory.remember("plantonista-42", fact);
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "qual cor?",
      userId: "plantonista-42",
    });
    assert.equal(result.status, 200);
    assert.equal(historyMessagesOf(result.json), 1);
    const prompt = String(calls[0]?.message);
    assert.match(prompt, /^Memória do plantonista:/);
    assert.match(prompt, new RegExp(fact));
    assert.match(prompt, /Plantonista: qual cor\?$/);
  } finally {
    await closeServer(started.server);
  }
});

test("POST /chat without userId keeps history-only prompt", async () => {
  const calls: CallLog[] = [];
  const memory = fakeMemoryStore({
    "fato secreto": unitAt(9),
    listar: unitAt(9),
  });
  await memory.remember("alguem", "fato secreto");
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "listar" });
    assert.equal(result.status, 200);
    assert.equal(calls[0]?.message, "Plantonista: listar");
    assert.equal(String(calls[0]?.message).includes("Memória do plantonista"), false);
  } finally {
    await closeServer(started.server);
  }
});

test("invalid userId is 400 and does not call the fake", async () => {
  const calls: CallLog[] = [];
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
    }),
  );

  try {
    for (const userId of [1, null, "", "   "]) {
      const result = await postJson(started.baseUrl, {
        message: "oi",
        userId,
      });
      assert.equal(result.status, 400);
      const issues = result.json.issues as Array<{ path: unknown[] }>;
      assert.ok(issues.some((issue) => issue.path.includes("userId")));
    }
    assert.equal(calls.length, 0);
  } finally {
    await closeServer(started.server);
  }
});

test("blank message with userId skips recall side effects", async () => {
  const calls: CallLog[] = [];
  const memory = fakeMemoryStore({ fato: unitAt(2) });
  await memory.remember("u1", "fato");
  const before = memory.database
    .prepare(`SELECT COUNT(*) AS c FROM memories`)
    .get() as { c: number };
  const started = await listen(
    createApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "   ",
      userId: "u1",
    });
    assert.equal(result.status, 200);
    assert.equal(historyMessagesOf(result.json), 0);
    assert.equal(calls.length, 0);
    const after = memory.database
      .prepare(`SELECT COUNT(*) AS c FROM memories`)
      .get() as { c: number };
    assert.equal(after.c, before.c);
  } finally {
    await closeServer(started.server);
  }
});
