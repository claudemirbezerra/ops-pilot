import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

import type { Critic } from "../agents/critic.js";
import type {
  ConversationSummarizer,
  SummarizeInput,
} from "../agents/conversation-summarizer.js";
import type { LearningExtractor } from "../agents/learning-extractor.js";
import type { ProductionRouter } from "../agents/production-graph.js";
import { OVERRIDE_REASON } from "../agents/production-route.js";
import {
  EMPTY_INPUT_ANSWER,
  type ProductionRoute,
  type ReasoningStrategy,
  type StrategyOptions,
  type StrategyResult,
  type TraceEvent,
} from "../agents/strategy.js";
import { estimateTokens } from "../context/tokens.js";
import { ChatTimeoutError, ModelUnavailableError } from "../domain/errors.js";
import type { Embedder } from "../domain/types.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { EMBEDDING_DIMS } from "../memory/similarity.js";
import {
  renderHistoryPrompt,
  renderSummaryPrompt,
  selectHistoryWindow,
} from "../services/history-prompt.js";
import { renderMemoryPrompt } from "../services/memory-prompt.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteRequestStore } from "../store/sqlite-request-store.js";
import { createLogger } from "../obs/logger.js";
import { createApp, type CreateAppOptions } from "./server.js";

function fixedRouter(
  route: ProductionRoute = "react",
  reason = "rota-de-teste",
  costs = { llmCalls: 1, promptTokens: 3 },
): ProductionRouter {
  return {
    async decide() {
      return { route, reason, ...costs };
    },
  };
}

function silentLogger() {
  return createLogger(() => undefined);
}

function testApp(options: CreateAppOptions = {}) {
  return createApp({
    ...options,
    router: options.router ?? fixedRouter("react"),
    requestStore: options.requestStore ?? new SqliteRequestStore(":memory:"),
    logger: options.logger ?? silentLogger(),
  });
}

const silentLearning: LearningExtractor = {
  async extract() {
    return { hasLearning: false, fact: "" };
  },
};

const silentSummarizer: ConversationSummarizer = {
  async summarize() {
    return "silent-summary";
  },
};

function countingSummarizer(calls: SummarizeInput[]): ConversationSummarizer {
  return {
    async summarize(input) {
      calls.push(input);
      const prev = input.previousSummary;
      return `SUMMARY(prev=${prev.length};n=${input.egressBatch.length})`;
    },
  };
}

async function flushLearning(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

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
  promptTokens = 0,
): ReasoningStrategy {
  return {
    name,
    async run(message: string, options: StrategyOptions): Promise<StrategyResult> {
      calls.push({ message, options });
      const answer = `${answerPrefix}:${message}`;
      return {
        answer,
        trace: [{ type: "answer", content: answer }],
        metrics: { llmCalls: 0, latencyMs: 1, promptTokens },
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
      return { approved: true, feedback: "ok", llmCalls: 0, promptTokens: 0 };
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
): Promise<{
  status: number;
  json: Record<string, unknown>;
  headers: Headers;
}> {
  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": init?.contentType ?? "application/json",
    },
    body: init?.raw ?? JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json, headers: response.headers };
}

async function getJson(
  baseUrl: string,
  path: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`);
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
    testApp({
      registry: {
        react: reactFake,
        "plan-and-execute": planFake,
      },
      critic,
      timeoutMs: 180_000,
      conversationStore: sharedStore,
      memoryStore: sharedMemory,
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
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
    testApp({
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
    testApp({
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
    testApp({
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
    testApp({
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
    testApp({
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

test("prompt keeps only the 8 newest messages", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const id = store.create();
  for (let index = 0; index < 8; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "novo",
      conversationId: id,
    });
    assert.equal(result.status, 200);
    assert.equal(historyMessagesOf(result.json), 8);
    const lines = String(calls[0]?.message).split("\n");
    assert.equal(lines.length, 8);
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
    testApp({
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
    testApp({
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
    testApp({
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
    testApp({
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
    assert.equal(unknownStrategy.status, 200);
    assert.equal(unknownStrategy.json.answer, EMPTY_INPUT_ANSWER);
    const blankTrace = unknownStrategy.json.trace as TraceEvent[];
    assert.equal(blankTrace.length, 1);
    assert.equal(blankTrace[0]?.type, "answer");
    assert.equal(blankTrace[0]?.node, "response");
    assert.equal(
      blankTrace.some((event) => event.type === "route"),
      false,
    );
    assert.equal(calls.length, 0);
    assert.equal(countTable(store, "messages"), 0);
  } finally {
    await closeServer(started.server);
  }
});

test("timeout does not create a conversation", async () => {
  const store = new SqliteConversationStore(":memory:");
  const started = await listen(
    testApp({
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
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
      learningExtractor: silentLearning,
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
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
      learningExtractor: silentLearning,
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
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
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
  const extractCalls: string[] = [];
  const memory = fakeMemoryStore({ fato: unitAt(2) });
  await memory.remember("u1", "fato");
  const before = memory.database
    .prepare(`SELECT COUNT(*) AS c FROM memories`)
    .get() as { c: number };
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
      learningExtractor: {
        async extract(message) {
          extractCalls.push(message);
          return { hasLearning: false, fact: "" };
        },
      },
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
    assert.equal(extractCalls.length, 0);
    const after = memory.database
      .prepare(`SELECT COUNT(*) AS c FROM memories`)
      .get() as { c: number };
    assert.equal(after.c, before.c);
  } finally {
    await closeServer(started.server);
  }
});

test("POST /chat with userId and durable stub remembers after response", async () => {
  const calls: CallLog[] = [];
  const fact = "Prefiro o cluster azul";
  const memory = fakeMemoryStore({
    [fact]: unitAt(3),
    "prefiro o cluster azul para pagamentos": unitAt(3),
  });
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
      learningExtractor: {
        async extract() {
          return { hasLearning: true, fact };
        },
      },
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "prefiro o cluster azul para pagamentos",
      userId: "learner-1",
    });
    assert.equal(result.status, 200);
    await flushLearning();
    const recalled = await memory.recall("learner-1", fact);
    assert.ok(recalled.some((item) => item.fact === fact));
  } finally {
    await closeServer(started.server);
  }
});

test("POST /chat without userId does not call learning extractor", async () => {
  const extractCalls: string[] = [];
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: {
        async extract(message) {
          extractCalls.push(message);
          return { hasLearning: true, fact: "não deveria" };
        },
      },
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "listar alertas" });
    assert.equal(result.status, 200);
    await flushLearning();
    assert.equal(extractCalls.length, 0);
  } finally {
    await closeServer(started.server);
  }
});

test("learning remember rejection still returns 200", async () => {
  const memory = fakeMemoryStore();
  const originalRemember = memory.remember.bind(memory);
  memory.remember = async () => {
    throw new Error("async remember failed");
  };
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
      learningExtractor: {
        async extract() {
          return { hasLearning: true, fact: "algo durável" };
        },
      },
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "lembre que prefiro azul",
      userId: "u-fail",
    });
    assert.equal(result.status, 200);
    assert.ok(typeof result.json.answer === "string");
    await flushLearning();
  } finally {
    memory.remember = originalRemember;
    await closeServer(started.server);
  }
});

test("200 metrics include promptTokens and contextBreakdown", async () => {
  const calls: CallLog[] = [];
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls, "react", 99),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "listar alertas" });
    assert.equal(result.status, 200);
    const metrics = result.json.metrics as {
      llmCalls: number;
      latencyMs: number;
      historyMessages: number;
      promptTokens: number;
      contextBreakdown: { history: number; memory: number; summary: number };
    };
    // fake strategy promptTokens 99 + injected router 3
    assert.equal(metrics.promptTokens, 102);
    assert.equal(metrics.llmCalls, 1);
    assert.equal(typeof metrics.latencyMs, "number");
    assert.equal(typeof metrics.historyMessages, "number");
    assert.equal(typeof metrics.contextBreakdown.history, "number");
    assert.equal(typeof metrics.contextBreakdown.memory, "number");
    assert.equal(typeof metrics.contextBreakdown.summary, "number");
    assert.equal(metrics.contextBreakdown.memory, 0);
    assert.equal(metrics.contextBreakdown.summary, 0);
    assert.ok(metrics.contextBreakdown.history > 0);
  } finally {
    await closeServer(started.server);
  }
});

test("blank message reports zero promptTokens and zero breakdown", async () => {
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "   " });
    assert.equal(result.status, 200);
    const metrics = result.json.metrics as {
      promptTokens: number;
      contextBreakdown: { history: number; memory: number; summary: number };
    };
    assert.equal(metrics.promptTokens, 0);
    assert.deepEqual(metrics.contextBreakdown, {
      history: 0,
      memory: 0,
      summary: 0,
    });
  } finally {
    await closeServer(started.server);
  }
});

test("contextBreakdown.memory matches estimateTokens of recall block", async () => {
  const calls: CallLog[] = [];
  const fact = "o cluster de pagamentos é o azul";
  const memory = fakeMemoryStore({
    [fact]: unitAt(8),
    "qual cor?": unitAt(8),
  });
  await memory.remember("plantonista-42", fact);
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: memory,
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const withMemory = await postJson(started.baseUrl, {
      message: "qual cor?",
      userId: "plantonista-42",
    });
    assert.equal(withMemory.status, 200);
    const metrics = withMemory.json.metrics as {
      contextBreakdown: { history: number; memory: number; summary: number };
    };
    const expectedMemory = estimateTokens(
      renderMemoryPrompt([{ fact }]),
    );
    const expectedHistory = estimateTokens(
      renderHistoryPrompt(selectHistoryWindow([], "qual cor?")),
    );
    assert.equal(metrics.contextBreakdown.memory, expectedMemory);
    assert.equal(metrics.contextBreakdown.history, expectedHistory);
    assert.equal(metrics.contextBreakdown.summary, 0);
    assert.ok(expectedMemory > 0);

    const withoutUser = await postJson(started.baseUrl, { message: "listar" });
    assert.equal(withoutUser.status, 200);
    const bare = withoutUser.json.metrics as {
      contextBreakdown: { history: number; memory: number; summary: number };
    };
    assert.equal(bare.contextBreakdown.memory, 0);
  } finally {
    await closeServer(started.server);
  }
});

test("seeded summary enters prompt and contextBreakdown.summary", async () => {
  const calls: CallLog[] = [];
  const store = new SqliteConversationStore(":memory:");
  const id = store.create();
  for (let index = 0; index < 4; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }
  store.upsertSummary(id, "decisão: abrir INC-9", 2);
  const summaryBlock = renderSummaryPrompt("decisão: abrir INC-9");
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "status?",
      conversationId: id,
    });
    assert.equal(result.status, 200);
    assert.match(String(calls[0]?.message), /Resumo da conversa:/);
    assert.match(String(calls[0]?.message), /decisão: abrir INC-9/);
    assert.ok(historyMessagesOf(result.json) as number <= 8);
    const metrics = result.json.metrics as {
      contextBreakdown: { summary: number };
    };
    assert.equal(
      metrics.contextBreakdown.summary,
      estimateTokens(summaryBlock),
    );
    const other = store.create();
    store.upsertSummary(other, "resumo-secreto-B", 1);
    const secondCalls: CallLog[] = [];
    const startedB = await listen(
      testApp({
        registry: {
          react: makeFake("react", secondCalls),
          "plan-and-execute": makeFake("plan-and-execute", []),
        },
        conversationStore: store,
        memoryStore: fakeMemoryStore(),
        conversationSummarizer: silentSummarizer,
      }),
    );
    try {
      const b = await postJson(startedB.baseUrl, {
        message: "oi",
        conversationId: other,
      });
      assert.equal(b.status, 200);
      assert.match(String(secondCalls[0]?.message), /resumo-secreto-B/);
      assert.equal(
        String(secondCalls[0]?.message).includes("abrir INC-9"),
        false,
      );
    } finally {
      await closeServer(startedB.server);
    }
  } finally {
    await closeServer(started.server);
  }
});

test("summarizer runs only when 8 messages leave the window", async () => {
  const calls: CallLog[] = [];
  const summarizeCalls: SummarizeInput[] = [];
  const store = new SqliteConversationStore(":memory:");
  const id = store.create();
  for (let index = 0; index < 14; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }
  // 14 msgs → outside window 8 = 6 pending; one more turn (+2) → 16 total, 8 pending
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
      conversationSummarizer: countingSummarizer(summarizeCalls),
    }),
  );

  try {
    const before = await postJson(started.baseUrl, {
      message: "quase",
      conversationId: id,
    });
    assert.equal(before.status, 200);
    // 16 msgs after append: pending was already 8 before this turn's append...
    // After 14 seed: pending=6. Turn adds 2 → 16 msgs, pending=8 → consolidates once.
    assert.equal(summarizeCalls.length, 1);
    assert.equal(summarizeCalls[0]!.egressBatch.length, 8);
    assert.equal(summarizeCalls[0]!.previousSummary, "");
    const summary = store.getSummary(id);
    assert.ok(summary);
    assert.equal(summary!.text, "SUMMARY(prev=0;n=8)");
    const trace = before.json.trace as TraceEvent[];
    assert.equal(
      trace.filter((event) => event.type === "summarize").length,
      1,
    );
    assert.equal(
      trace.find((event) => event.type === "summarize")?.content,
      summary!.text,
    );
    assert.equal(
      trace.find((event) => event.type === "summarize")?.node,
      "response",
    );

    const mid = await postJson(started.baseUrl, {
      message: "meio",
      conversationId: id,
    });
    assert.equal(mid.status, 200);
    assert.equal(summarizeCalls.length, 1);
    assert.equal(
      (mid.json.trace as TraceEvent[]).some((e) => e.type === "summarize"),
      false,
    );
    assert.match(String(calls[1]?.message), /Resumo da conversa:/);

    // Grow until next batch of 8 egresses: after first cover through id 8,
    // need 8 more outside window. Continue posting until second call.
    for (let i = 0; i < 8; i += 1) {
      await postJson(started.baseUrl, {
        message: `extra-${i}`,
        conversationId: id,
      });
    }
    assert.ok(summarizeCalls.length >= 2);
    assert.ok(summarizeCalls[1]!.previousSummary.length > 0);
  } finally {
    await closeServer(started.server);
  }
});

test("summarizer soft-fail leaves prior summary and omits summarize event", async () => {
  // 18 msgs, cover through 2 → 8 pending outside the last-8 window (ids 3..10).
  const store = new SqliteConversationStore(":memory:");
  const id = store.create();
  for (let index = 0; index < 18; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `z${index}`,
    });
  }
  store.upsertSummary(id, "keep-me", 2);
  assert.equal(store.listUnsummarizedOutsideWindow(id, 8, 2).length, 8);

  const throwing: ConversationSummarizer = {
    async summarize() {
      throw new Error("boom");
    },
  };
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
      conversationSummarizer: throwing,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "go",
      conversationId: id,
    });
    assert.equal(result.status, 200);
    assert.equal(store.getSummary(id)?.text, "keep-me");
    assert.equal(
      (result.json.trace as TraceEvent[]).some((e) => e.type === "summarize"),
      false,
    );
  } finally {
    await closeServer(started.server);
  }
});

test("blank message does not call summarizer", async () => {
  const summarizeCalls: SummarizeInput[] = [];
  const store = new SqliteConversationStore(":memory:");
  const id = store.create();
  for (let index = 0; index < 16; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: store,
      memoryStore: fakeMemoryStore(),
      conversationSummarizer: countingSummarizer(summarizeCalls),
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "  ",
      conversationId: id,
    });
    assert.equal(result.status, 200);
    assert.equal(summarizeCalls.length, 0);
  } finally {
    await closeServer(started.server);
  }
});

test("omitted strategy emits route event from injected router", async () => {
  const result = await postJson(baseUrl, { message: "ver rota" });
  assert.equal(result.status, 200);
  const trace = result.json.trace as TraceEvent[];
  assert.equal(trace[0]?.type, "route");
  if (trace[0]?.type === "route") {
    assert.equal(trace[0].route, "react");
    assert.equal(trace[0].override, false);
    assert.equal(trace[0].node, "router");
    assert.equal(trace[0].reason, "rota-de-teste");
  }
  assert.ok(trace.every((event) => event.node !== undefined));
  const metrics = result.json.metrics as { llmCalls: number; promptTokens: number };
  assert.ok(metrics.llmCalls >= 1);
  assert.ok(metrics.promptTokens >= 3);
});

test("strategy override marks route event and skips router", async () => {
  let decideCalls = 0;
  const router: ProductionRouter = {
    async decide() {
      decideCalls += 1;
      return {
        route: "react",
        reason: "nao-deve",
        llmCalls: 1,
        promptTokens: 9,
      };
    },
  };
  const calls: CallLog[] = [];
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", calls),
      },
      router,
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "forcar pe",
      strategy: "plan-and-execute",
    });
    assert.equal(result.status, 200);
    assert.equal(decideCalls, 0);
    assert.equal(calls.length, 1);
    const trace = result.json.trace as TraceEvent[];
    assert.equal(trace[0]?.type, "route");
    if (trace[0]?.type === "route") {
      assert.equal(trace[0].override, true);
      assert.equal(trace[0].reason, OVERRIDE_REASON);
      assert.equal(trace[0].route, "plan-and-execute");
    }
  } finally {
    await closeServer(started.server);
  }
});

test("strategy reflection is accepted as override", async () => {
  const calls: CallLog[] = [];
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      critic,
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, {
      message: "revisar resposta",
      strategy: "reflection",
    });
    assert.equal(result.status, 200);
    assert.equal(calls.length, 1);
    const trace = result.json.trace as TraceEvent[];
    assert.equal(trace[0]?.type, "route");
    if (trace[0]?.type === "route") {
      assert.equal(trace[0].route, "reflection");
      assert.equal(trace[0].override, true);
    }
    assert.ok(
      trace
        .filter((event) => event.type !== "route")
        .every((event) => event.node === "reflection"),
    );
  } finally {
    await closeServer(started.server);
  }
});

test("invalid automatic route returns 502", async () => {
  const calls: CallLog[] = [];
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", calls),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      router: {
        async decide() {
          return {
            route: "react",
            reason: " ",
            llmCalls: 1,
            promptTokens: 1,
          };
        },
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "falha rota" });
    assert.equal(result.status, 502);
    assert.equal(result.json.message, "Não foi possível decidir a rota.");
    assert.equal(result.json.answer, undefined);
    assert.equal(result.json.trace, undefined);
    assert.equal(result.json.metrics, undefined);
    assert.equal(calls.length, 0);
  } finally {
    await closeServer(started.server);
  }
});

test("ModelUnavailableError returns 503 without answer/trace/metrics", async () => {
  const unavailable: ReasoningStrategy = {
    name: "react",
    async run() {
      throw new ModelUnavailableError();
    },
  };
  const started = await listen(
    testApp({
      registry: {
        react: unavailable,
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      router: fixedRouter("react"),
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "preciso do modelo" });
    assert.equal(result.status, 503);
    assert.equal(result.json.message, "Modelo indisponível.");
    assert.equal(result.json.answer, undefined);
    assert.equal(result.json.trace, undefined);
    assert.equal(result.json.metrics, undefined);
  } finally {
    await closeServer(started.server);
  }
});

test("200 preserves metrics.modelUsed and fallback trace event", async () => {
  const withFallback: ReasoningStrategy = {
    name: "react",
    async run(message: string): Promise<StrategyResult> {
      return {
        answer: `ok:${message}`,
        trace: [
          {
            type: "fallback",
            from: "model-a",
            to: "model-b",
            node: "react",
          },
          { type: "answer", content: `ok:${message}` },
        ],
        metrics: {
          llmCalls: 1,
          latencyMs: 1,
          promptTokens: 2,
          modelUsed: "model-b",
        },
      };
    },
  };
  const started = await listen(
    testApp({
      registry: {
        react: withFallback,
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      router: fixedRouter("react", "teste", { llmCalls: 0, promptTokens: 0 }),
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
    }),
  );

  try {
    const result = await postJson(started.baseUrl, { message: "com fallback" });
    assert.equal(result.status, 200);
    const metrics = result.json.metrics as { modelUsed?: string };
    assert.equal(metrics.modelUsed, "model-b");
    const trace = result.json.trace as TraceEvent[];
    assert.ok(
      trace.some(
        (event) =>
          event.type === "fallback" &&
          event.from === "model-a" &&
          event.to === "model-b",
      ),
    );
  } finally {
    await closeServer(started.server);
  }
});

test("POST /chat 200 exposes requestId equal to X-Request-Id header", async () => {
  const result = await postJson(baseUrl, { message: "correlacionar id" });
  assert.equal(result.status, 200);
  const requestId = result.json.requestId;
  assert.equal(typeof requestId, "string");
  assert.ok((requestId as string).length > 0);
  assert.equal(result.headers.get("x-request-id"), requestId);
});

test("two POST /chat calls get distinct requestIds", async () => {
  const a = await postJson(baseUrl, { message: "id-a" });
  const b = await postJson(baseUrl, { message: "id-b" });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.json.requestId, b.json.requestId);
});

test("domain error after schema keeps X-Request-Id header", async () => {
  const result = await postJson(baseUrl, {
    message: "x",
    strategy: "estrategia-que-nao-existe",
  });
  assert.equal(result.status, 422);
  const headerId = result.headers.get("x-request-id");
  assert.ok(headerId && headerId.length > 0);
});

test("POST /chat persists request and GET /request/:id returns ordered trace", async () => {
  const requestStore = new SqliteRequestStore(":memory:");
  const multiTrace: ReasoningStrategy = {
    name: "react",
    async run(message: string): Promise<StrategyResult> {
      return {
        answer: `ok:${message}`,
        trace: [
          { type: "thought", content: "t1", node: "react" },
          { type: "answer", content: `ok:${message}`, node: "response" },
        ],
        metrics: { llmCalls: 0, latencyMs: 2, promptTokens: 7 },
      };
    },
  };
  const started = await listen(
    testApp({
      registry: {
        react: multiTrace,
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      router: fixedRouter("react", "teste", { llmCalls: 0, promptTokens: 0 }),
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
      requestStore,
    }),
  );

  try {
    const chat = await postJson(started.baseUrl, { message: "persistir" });
    assert.equal(chat.status, 200);
    const requestId = chat.json.requestId as string;
    const chatTrace = chat.json.trace as TraceEvent[];

    const saved = requestStore.getById(requestId);
    assert.ok(saved);
    assert.equal(saved.trace.length, chatTrace.length);
    assert.deepEqual(
      saved.trace.map((e) => e.type),
      chatTrace.map((e) => e.type),
    );

    const got = await getJson(started.baseUrl, `/request/${requestId}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.requestId, requestId);
    assert.equal(typeof got.json.createdAt, "number");
    const gotTrace = got.json.trace as TraceEvent[];
    assert.equal(gotTrace.length, chatTrace.length);
    assert.deepEqual(
      gotTrace.map((e) => e.type),
      chatTrace.map((e) => e.type),
    );
    const metrics = got.json.metrics as { promptTokens?: number };
    assert.equal(metrics.promptTokens, 7);
  } finally {
    await closeServer(started.server);
  }
});

test("blank POST /chat still persists request for GET", async () => {
  const requestStore = new SqliteRequestStore(":memory:");
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
      requestStore,
    }),
  );

  try {
    const chat = await postJson(started.baseUrl, { message: "   " });
    assert.equal(chat.status, 200);
    const requestId = chat.json.requestId as string;
    const got = await getJson(started.baseUrl, `/request/${requestId}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.requestId, requestId);
    assert.ok(Array.isArray(got.json.trace));
  } finally {
    await closeServer(started.server);
  }
});

test("GET /request unknown id returns 404 Request não encontrado.", async () => {
  const result = await getJson(
    baseUrl,
    "/request/00000000-0000-0000-0000-000000000000",
  );
  assert.equal(result.status, 404);
  assert.equal(result.json.message, "Request não encontrado.");
});

test("GET /request with whitespace id returns 400", async () => {
  const response = await fetch(`${baseUrl}/request/%20%20`);
  const json = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 400);
  assert.ok(json.issues);
});

test("chat logger emits one metadata line per trace event", async () => {
  const lines: string[] = [];
  const requestStore = new SqliteRequestStore(":memory:");
  const multiTrace: ReasoningStrategy = {
    name: "react",
    async run(message: string): Promise<StrategyResult> {
      return {
        answer: `ok:${message}`,
        trace: [
          { type: "thought", content: "secret-payload", node: "react" },
          { type: "answer", content: `ok:${message}` },
        ],
        metrics: { llmCalls: 0, latencyMs: 1, promptTokens: 3 },
      };
    },
  };
  const started = await listen(
    testApp({
      registry: {
        react: multiTrace,
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      router: fixedRouter("react", "teste", { llmCalls: 0, promptTokens: 0 }),
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
      requestStore,
      logger: createLogger((line) => {
        lines.push(line);
      }),
    }),
  );

  try {
    const chat = await postJson(started.baseUrl, { message: "log meta" });
    assert.equal(chat.status, 200);
    const requestId = chat.json.requestId as string;
    const chatTrace = chat.json.trace as TraceEvent[];
    const traceLines = lines
      .map((line) => JSON.parse(line.trim()) as Record<string, unknown>)
      .filter((row) => typeof row.seq === "number");
    assert.equal(traceLines.length, chatTrace.length);
    assert.ok(traceLines.length >= 2);
    assert.equal(traceLines[0]!.requestId, requestId);
    for (let i = 0; i < traceLines.length; i += 1) {
      assert.equal(traceLines[i]!.seq, i);
      assert.equal("content" in traceLines[i]!, false);
      assert.equal("payload" in traceLines[i]!, false);
    }
  } finally {
    await closeServer(started.server);
  }
});

test("parallel chats do not mix persisted traces", async () => {
  const requestStore = new SqliteRequestStore(":memory:");
  const started = await listen(
    testApp({
      registry: {
        react: makeFake("react", []),
        "plan-and-execute": makeFake("plan-and-execute", []),
      },
      conversationStore: new SqliteConversationStore(":memory:"),
      memoryStore: fakeMemoryStore(),
      learningExtractor: silentLearning,
      conversationSummarizer: silentSummarizer,
      requestStore,
    }),
  );

  try {
    const [a, b] = await Promise.all([
      postJson(started.baseUrl, { message: "paralelo-a" }),
      postJson(started.baseUrl, { message: "paralelo-b" }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const idA = a.json.requestId as string;
    const idB = b.json.requestId as string;
    assert.notEqual(idA, idB);
    const gotA = await getJson(started.baseUrl, `/request/${idA}`);
    const gotB = await getJson(started.baseUrl, `/request/${idB}`);
    const answerA = (gotA.json.trace as TraceEvent[]).find(
      (e) => e.type === "answer",
    );
    const answerB = (gotB.json.trace as TraceEvent[]).find(
      (e) => e.type === "answer",
    );
    assert.ok(answerA && "content" in answerA);
    assert.ok(answerB && "content" in answerB);
    assert.match(String(answerA.content), /paralelo-a/);
    assert.match(String(answerB.content), /paralelo-b/);
  } finally {
    await closeServer(started.server);
  }
});
