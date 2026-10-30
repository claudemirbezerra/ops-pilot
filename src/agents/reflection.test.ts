import assert from "node:assert/strict";
import test from "node:test";

import type { Critic } from "./critic.js";
import {
  DEFAULT_REJECT_FEEDBACK,
  buildFeedbackInput,
  ensureFinalAnswer,
  extractObservations,
  formatCritiqueContent,
  wrapWithReflection,
} from "./reflection.js";
import {
  MODEL_UNAVAILABLE_ANSWER,
  type ReasoningStrategy,
  type StrategyResult,
  type TraceEvent,
} from "./strategy.js";
import { formatTrace } from "./trace.js";

function mockBase(handler: (input: string) => Promise<StrategyResult>): ReasoningStrategy {
  return {
    name: "react",
    run: handler,
  };
}

function approvingCritic(): Critic {
  return {
    async evaluate() {
      return { approved: true, feedback: "ok", llmCalls: 0, promptTokens: 0 };
    },
  };
}

function alwaysRejectCritic(feedback = "corrija a severidade"): Critic {
  return {
    async evaluate() {
      return { approved: false, feedback, llmCalls: 1, promptTokens: 0 };
    },
  };
}

function countingRejectCritic(): { critic: Critic; calls: () => number } {
  let calls = 0;
  return {
    critic: {
      async evaluate() {
        calls += 1;
        return { approved: false, feedback: "ainda incompleto", llmCalls: 1, promptTokens: 0 };
      },
    },
    calls: () => calls,
  };
}

test("helpers: observations, feedback input, critique content, final answer", () => {
  const trace: TraceEvent[] = [
    { type: "observation", content: "3 firing" },
    { type: "answer", content: "há 3" },
  ];
  assert.deepEqual(extractObservations(trace), ["3 firing"]);
  assert.ok(buildFeedbackInput("liste alertas", "").includes(DEFAULT_REJECT_FEEDBACK));
  assert.ok(buildFeedbackInput("liste alertas", "  ").includes(DEFAULT_REJECT_FEEDBACK));
  assert.match(buildFeedbackInput("liste alertas", "fix X"), /fix X/);
  assert.equal(formatCritiqueContent({ approved: true, feedback: "" }), "Aprovado.");
  assert.ok(
    formatCritiqueContent({ approved: false, feedback: "" }).includes(DEFAULT_REJECT_FEEDBACK),
  );
  const ensured = ensureFinalAnswer(
    [...trace, { type: "critique", content: "Aprovado." }],
    "há 3",
  );
  const last = ensured.at(-1);
  assert.equal(last?.type, "answer");
  assert.ok(last?.type === "answer" && last.content === "há 3");
});

test("pendingApproval short-circuits without critic", async () => {
  let criticCalls = 0;
  const critic: Critic = {
    async evaluate() {
      criticCalls += 1;
      return { approved: true, feedback: "", llmCalls: 0, promptTokens: 0 };
    },
  };
  const base = mockBase(async () => ({
    answer: "Aguardando aprovação humana.",
    trace: [
      {
        type: "action",
        tool: "open_incident",
        args: { title: "t", service: "checkout", severity: "medium" },
      },
    ],
    metrics: { llmCalls: 1, latencyMs: 1, promptTokens: 0 },
    pendingApproval: {
      tool: "open_incident",
      args: { title: "t", service: "checkout", severity: "medium" },
      description: 'Abrir incidente: "t" · checkout · medium',
    },
  }));

  const wrapped = wrapWithReflection({
    base,
    critic,
    name: "reflect:react",
  });
  const result = await wrapped.run("abra incidente no checkout", {
    maxIterations: 4,
    maxReflections: 2,
  });

  assert.equal(criticCalls, 0);
  assert.ok(result.pendingApproval);
  assert.equal(result.pendingApproval?.tool, "open_incident");
  assert.equal(result.answer, "Aguardando aprovação humana.");
});

test("US1: approving critic yields critique then final answer; blank skips critic", async () => {
  let criticCalls = 0;
  const critic: Critic = {
    async evaluate() {
      criticCalls += 1;
      return { approved: true, feedback: "bom", llmCalls: 0, promptTokens: 0 };
    },
  };
  const base = mockBase(async () => ({
    answer: "3 alertas em disparo",
    trace: [
      { type: "observation", content: "firing=3" },
      { type: "answer", content: "3 alertas em disparo" },
    ],
    metrics: { llmCalls: 2, latencyMs: 5, promptTokens: 0 },
  }));

  const wrapped = wrapWithReflection({
    base,
    critic,
    name: "reflect:react",
  });

  const result = await wrapped.run("Quais alertas estão em disparo?", {
    maxIterations: 4,
    maxReflections: 2,
  });

  assert.equal(criticCalls, 1);
  assert.ok(result.trace.some((event) => event.type === "critique"));
  const lastEvent = result.trace.at(-1);
  assert.equal(lastEvent?.type, "answer");
  assert.equal(result.answer, "3 alertas em disparo");
  assert.ok(lastEvent?.type === "answer" && lastEvent.content === result.answer);

  const empty = await wrapped.run("   ", { maxIterations: 4, maxReflections: 2 });
  assert.equal(criticCalls, 1);
  assert.equal(empty.metrics.llmCalls, 0);
  assert.ok(!empty.trace.some((event) => event.type === "critique"));
});

test("US2: always-reject with maxReflections 2 caps regenerations; empty feedback still regenerates", async () => {
  let baseRuns = 0;
  const inputs: string[] = [];
  const { critic, calls } = countingRejectCritic();
  const base = mockBase(async (input) => {
    baseRuns += 1;
    inputs.push(input);
    return {
      answer: `tentativa-${baseRuns}`,
      trace: [{ type: "answer", content: `tentativa-${baseRuns}` }],
      metrics: { llmCalls: 1, latencyMs: 1, promptTokens: 0 },
    };
  });

  const wrapped = wrapWithReflection({
    base,
    critic,
    name: "reflect:react",
  });

  const result = await wrapped.run("abra incidente", {
    maxIterations: 4,
    maxReflections: 2,
  });

  assert.equal(baseRuns, 3);
  assert.equal(calls(), 3);
  assert.equal(result.trace.filter((event) => event.type === "critique").length, 3);
  assert.equal(result.answer, "tentativa-3");
  assert.ok(inputs[1]?.includes("[Feedback do crítico]"));

  const emptyFeedbackBaseRuns = { n: 0 };
  const emptyFeedbackCritic: Critic = {
    async evaluate() {
      return { approved: false, feedback: "   ", llmCalls: 0, promptTokens: 0 };
    },
  };
  const emptyFeedbackWrapped = wrapWithReflection({
    base: mockBase(async (input) => {
      emptyFeedbackBaseRuns.n += 1;
      if (emptyFeedbackBaseRuns.n === 2) {
        assert.match(input, new RegExp(DEFAULT_REJECT_FEEDBACK));
      }
      return {
        answer: `e-${emptyFeedbackBaseRuns.n}`,
        trace: [{ type: "answer", content: `e-${emptyFeedbackBaseRuns.n}` }],
        metrics: { llmCalls: 0, latencyMs: 0, promptTokens: 0 },
      };
    }),
    critic: emptyFeedbackCritic,
    name: "reflect:plan-and-execute",
  });
  await emptyFeedbackWrapped.run("pedido", { maxIterations: 2, maxReflections: 1 });
  assert.equal(emptyFeedbackBaseRuns.n, 2);

  let regenCount = 0;
  const approveWrapped = wrapWithReflection({
    base: mockBase(async () => {
      regenCount += 1;
      return {
        answer: "ok",
        trace: [{ type: "answer", content: "ok" }],
        metrics: { llmCalls: 0, latencyMs: 0, promptTokens: 0 },
      };
    }),
    critic: approvingCritic(),
    name: "reflect:react",
  });
  await approveWrapped.run("pedido", { maxIterations: 2, maxReflections: 2 });
  assert.equal(regenCount, 1);
});

test("US2: critic unavailable keeps last base answer with critique note", async () => {
  const wrapped = wrapWithReflection({
    base: mockBase(async () => ({
      answer: "base-ok",
      trace: [{ type: "answer", content: "base-ok" }],
      metrics: { llmCalls: 1, latencyMs: 1, promptTokens: 0 },
    })),
    critic: {
      async evaluate() {
        throw new Error("network down");
      },
    },
    name: "reflect:react",
  });

  const result = await wrapped.run("pedido", { maxIterations: 2, maxReflections: 2 });
  assert.equal(result.answer, "base-ok");
  assert.ok(result.trace.some((event) => event.type === "critique"));
  assert.equal(result.trace.at(-1)?.type, "answer");
});

test("US2: base model unavailable skips inventing critique", async () => {
  let criticCalls = 0;
  const wrapped = wrapWithReflection({
    base: mockBase(async () => ({
      answer: MODEL_UNAVAILABLE_ANSWER,
      trace: [{ type: "answer", content: MODEL_UNAVAILABLE_ANSWER }],
      metrics: { llmCalls: 0, latencyMs: 1, promptTokens: 0 },
    })),
    critic: {
      async evaluate() {
        criticCalls += 1;
        return { approved: true, feedback: "", llmCalls: 0, promptTokens: 0 };
      },
    },
    name: "reflect:react",
  });

  const result = await wrapped.run("pedido", { maxIterations: 2, maxReflections: 2 });
  assert.equal(criticCalls, 0);
  assert.ok(!result.trace.some((event) => event.type === "critique"));
  assert.equal(result.answer, MODEL_UNAVAILABLE_ANSWER);
});

test("US3: llmCalls sum base + critic; latencyMs covers full cycle", async () => {
  const wrapped = wrapWithReflection({
    base: mockBase(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        answer: "a",
        trace: [{ type: "answer", content: "a" }],
        metrics: { llmCalls: 2, latencyMs: 1, promptTokens: 0 },
      };
    }),
    critic: alwaysRejectCritic(),
    name: "reflect:react",
  });

  const result = await wrapped.run("pedido", { maxIterations: 2, maxReflections: 1 });
  // 2 base runs * 2 llmCalls + 2 critic evaluates * 1 = 6
  assert.equal(result.metrics.llmCalls, 2 * 2 + 2 * 1);
  assert.ok(result.metrics.latencyMs >= 5);
});

test("promptTokens sum base + critic", async () => {
  const critic: Critic = {
    async evaluate() {
      return {
        approved: true,
        feedback: "ok",
        llmCalls: 1,
        promptTokens: 2,
      };
    },
  };
  const wrapped = wrapWithReflection({
    base: mockBase(async () => ({
      answer: "a",
      trace: [{ type: "answer", content: "a" }],
      metrics: { llmCalls: 1, latencyMs: 1, promptTokens: 3 },
    })),
    critic,
    name: "reflect:react",
  });

  const result = await wrapped.run("pedido", { maxIterations: 2, maxReflections: 1 });
  assert.equal(result.metrics.promptTokens, 5);
});

test("US5: offline always-reject twice yields identical formatTrace and stop rule", async () => {
  const make = () => {
    let n = 0;
    return wrapWithReflection({
      base: mockBase(async () => {
        n += 1;
        return {
          answer: `r${n}`,
          trace: [
            { type: "observation", content: `obs-${n}` },
            { type: "answer", content: `r${n}` },
          ],
          metrics: { llmCalls: 1, latencyMs: 0, promptTokens: 0 },
        };
      }),
      critic: alwaysRejectCritic("faltou resolver"),
      name: "reflect:react",
    });
  };

  const first = await make().run("mesmo pedido", { maxIterations: 3, maxReflections: 2 });
  const second = await make().run("mesmo pedido", { maxIterations: 3, maxReflections: 2 });

  assert.equal(first.trace.filter((e) => e.type === "critique").length, 3);
  assert.equal(second.trace.filter((e) => e.type === "critique").length, 3);
  const formattedFirst = formatTrace(first.trace);
  const formattedSecond = formatTrace(second.trace);
  assert.equal(formattedFirst, formattedSecond);
  assert.match(formattedFirst, /\[critique\]/);
  assert.equal(first.answer, second.answer);
});
