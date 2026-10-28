import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildContext,
  resolveContextBudgets,
  type ContextBudgets,
  type ContextSectionInput,
  type MemoryItem,
} from "./context-builder.js";
import { estimateTokens } from "./tokens.js";

const HIGH: ContextBudgets = { summary: 10_000, window: 10_000, memory: 10_000 };

function baseInput(
  overrides: Partial<ContextSectionInput> = {},
): ContextSectionInput {
  return {
    system: "",
    message: "pedido atual",
    summary: "",
    window: [],
    memory: [],
    ...overrides,
  };
}

test("resolveContextBudgets defaults 200/1200/300", () => {
  assert.deepEqual(resolveContextBudgets({}), {
    summary: 200,
    window: 1200,
    memory: 300,
  });
});

test("resolveContextBudgets accepts valid overrides", () => {
  assert.deepEqual(
    resolveContextBudgets({
      CONTEXT_BUDGET_SUMMARY: "10",
      CONTEXT_BUDGET_WINDOW: "0",
      CONTEXT_BUDGET_MEMORY: "5",
    }),
    { summary: 10, window: 0, memory: 5 },
  );
});

test("resolveContextBudgets rejects invalid values", () => {
  assert.deepEqual(
    resolveContextBudgets({
      CONTEXT_BUDGET_SUMMARY: "abc",
      CONTEXT_BUDGET_WINDOW: "-1",
      CONTEXT_BUDGET_MEMORY: "12.7",
    }),
    { summary: 200, window: 1200, memory: 300 },
  );
});

test("resolveContextBudgets partial override leaves others default", () => {
  assert.deepEqual(
    resolveContextBudgets({ CONTEXT_BUDGET_WINDOW: "50" }),
    { summary: 200, window: 50, memory: 300 },
  );
});

test("buildContext joins non-empty sections in contract order", () => {
  const built = buildContext(
    baseInput({
      system: "SYS",
      message: "agora",
      summary: "fato antigo",
      window: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
      ],
      memory: [{ fact: "cluster azul", score: 0.9 }],
    }),
    HIGH,
  );
  assert.equal(built.sections.system, "SYS");
  assert.equal(built.sections.message, "agora");
  assert.match(built.sections.summary, /Resumo da conversa:/);
  assert.match(built.sections.memory, /Memória do plantonista:/);
  assert.match(built.sections.window, /Plantonista: u1/);
  assert.ok(built.prompt.startsWith("SYS\n\n"));
  assert.ok(built.prompt.includes("Memória do plantonista:"));
  assert.ok(built.prompt.includes("Resumo da conversa:"));
  assert.ok(built.prompt.includes("Plantonista: u1"));
  assert.ok(built.prompt.includes("Plantonista: agora"));
  const sysIdx = built.prompt.indexOf("SYS");
  const memIdx = built.prompt.indexOf("Memória");
  const sumIdx = built.prompt.indexOf("Resumo");
  const histIdx = built.prompt.indexOf("Plantonista: u1");
  assert.ok(sysIdx < memIdx && memIdx < sumIdx && sumIdx < histIdx);
});

test("buildContext omits empty summary and memory", () => {
  const built = buildContext(
    baseInput({ system: "S", message: "m" }),
    HIGH,
  );
  assert.equal(built.sections.summary, "");
  assert.equal(built.sections.memory, "");
  assert.equal(built.prompt, "S\n\nPlantonista: m");
});

test("system and message stay intact under zero budgets", () => {
  const system = "X".repeat(400);
  const message = "Y".repeat(400);
  const built = buildContext(
    baseInput({
      system,
      message,
      summary: "Z".repeat(400),
      window: [
        { role: "user", content: "old" },
        { role: "assistant", content: "reply" },
      ],
      memory: [
        { fact: "a".repeat(200), score: 0.2 },
        { fact: "b".repeat(200), score: 0.9 },
      ],
    }),
    { summary: 0, window: 0, memory: 0 },
  );
  assert.equal(built.sections.system, system);
  assert.equal(built.sections.message, message);
  assert.ok(built.prompt.includes(system));
  assert.ok(built.prompt.includes(`Plantonista: ${message}`));
  assert.equal(built.sections.summary, "");
  assert.equal(built.sections.window, "");
  assert.equal(built.sections.memory, "");
});

test("window cuts oldest first", () => {
  const window = [
    { role: "user" as const, content: "oldest-aaaaaaaa" },
    { role: "assistant" as const, content: "mid-bbbbbbbbbb" },
    { role: "user" as const, content: "newest-cccccccc" },
  ];
  // Budget that fits only the newest line roughly.
  const newestLine = "Plantonista: newest-cccccccc";
  const budget = estimateTokens(newestLine);
  const built = buildContext(baseInput({ window }), {
    summary: 100,
    window: budget,
    memory: 100,
  });
  assert.deepEqual(built.kept.window, [window[2]]);
  assert.equal(built.sections.window, newestLine);
  assert.ok(!built.prompt.includes("oldest-aaaaaaaa"));
  assert.ok(built.prompt.includes("newest-cccccccc"));
});

test("window in budget keeps all", () => {
  const window = [
    { role: "user" as const, content: "a" },
    { role: "assistant" as const, content: "b" },
  ];
  const built = buildContext(baseInput({ window }), HIGH);
  assert.deepEqual(built.kept.window, window);
});

test("single window message over budget is dropped", () => {
  const huge = { role: "user" as const, content: "H".repeat(400) };
  const built = buildContext(baseInput({ window: [huge] }), {
    summary: 100,
    window: 1,
    memory: 100,
  });
  assert.deepEqual(built.kept.window, []);
  assert.equal(built.sections.window, "");
});

test("memory cuts lowest score first", () => {
  const memory: MemoryItem[] = [
    { fact: "keep-high-" + "x".repeat(40), score: 0.9 },
    { fact: "drop-mid-" + "y".repeat(40), score: 0.5 },
    { fact: "drop-low-" + "z".repeat(40), score: 0.2 },
  ];
  const onlyHigh = [memory[0]!];
  const highTextTokens = estimateTokens(
    ["Memória do plantonista:", `- ${memory[0]!.fact}`].join("\n"),
  );
  const built = buildContext(baseInput({ memory }), {
    summary: 100,
    window: 100,
    memory: highTextTokens,
  });
  assert.deepEqual(built.kept.memory, onlyHigh);
  assert.ok(built.sections.memory.includes("keep-high-"));
  assert.ok(!built.sections.memory.includes("drop-low-"));
  assert.ok(!built.sections.memory.includes("drop-mid-"));
});

test("memory equal scores drop by original index ascending", () => {
  const memory: MemoryItem[] = [
    { fact: "first-" + "a".repeat(40), score: 0.5 },
    { fact: "second-" + "b".repeat(40), score: 0.5 },
  ];
  const secondOnlyTokens = estimateTokens(
    ["Memória do plantonista:", `- ${memory[1]!.fact}`].join("\n"),
  );
  const built = buildContext(baseInput({ memory }), {
    summary: 100,
    window: 100,
    memory: secondOnlyTokens,
  });
  // Same score → drop lower index first (index 0), keep second.
  assert.deepEqual(built.kept.memory, [memory[1]]);
});

test("summary truncates to budget", () => {
  const summary = "S".repeat(800);
  const built = buildContext(baseInput({ summary }), {
    summary: 20,
    window: 100,
    memory: 100,
  });
  assert.ok(estimateTokens(built.sections.summary) <= 20);
  assert.ok(built.sections.summary.length > 0);
});

test("low budgets cut all sections in the right order", () => {
  const system = "SYSTEM-PROTECTED";
  const message = "MESSAGE-PROTECTED";
  const window = [
    { role: "user" as const, content: "w-old-" + "o".repeat(30) },
    { role: "user" as const, content: "w-new-" + "n".repeat(30) },
  ];
  const memory: MemoryItem[] = [
    { fact: "m-high-" + "h".repeat(30), score: 0.95 },
    { fact: "m-low-" + "l".repeat(30), score: 0.1 },
  ];
  const newLine = `Plantonista: ${window[1]!.content}`;
  const highMem = ["Memória do plantonista:", `- ${memory[0]!.fact}`].join(
    "\n",
  );
  const built = buildContext(
    baseInput({
      system,
      message,
      summary: "SUM".repeat(200),
      window,
      memory,
    }),
    {
      summary: 5,
      window: estimateTokens(newLine),
      memory: estimateTokens(highMem),
    },
  );
  assert.equal(built.sections.system, system);
  assert.equal(built.sections.message, message);
  assert.deepEqual(built.kept.window, [window[1]]);
  assert.deepEqual(built.kept.memory, [memory[0]]);
  assert.ok(estimateTokens(built.sections.summary) <= 5);
  assert.ok(estimateTokens(built.sections.window) <= estimateTokens(newLine));
  assert.ok(estimateTokens(built.sections.memory) <= estimateTokens(highMem));
});

test("buildContext is deterministic", () => {
  const input = baseInput({
    system: "s",
    message: "m",
    summary: "resumo",
    window: [
      { role: "user", content: "u" },
      { role: "assistant", content: "a" },
    ],
    memory: [
      { fact: "f1", score: 0.4 },
      { fact: "f2", score: 0.8 },
    ],
  });
  const budgets = { summary: 50, window: 40, memory: 40 };
  assert.deepEqual(buildContext(input, budgets), buildContext(input, budgets));
});
