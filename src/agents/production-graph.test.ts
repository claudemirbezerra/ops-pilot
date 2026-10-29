import assert from "node:assert/strict";
import test from "node:test";

import type { Critic } from "./critic.js";
import {
  runProductionGraph,
  type ProductionRouter,
} from "./production-graph.js";
import { OVERRIDE_REASON, isProductionRoute } from "./production-route.js";
import type {
  ProductionRoute,
  ReasoningStrategy,
  StrategyResult,
} from "./strategy.js";
import { InvalidRouteError } from "../domain/errors.js";

function fakeStrategy(
  name: "react" | "plan-and-execute",
  calls: string[],
  answer = `${name}-answer`,
): ReasoningStrategy {
  return {
    name,
    async run(input: string): Promise<StrategyResult> {
      calls.push(input);
      return {
        answer,
        trace: [
          { type: "thought", content: `${name}-thought` },
          { type: "answer", content: answer },
        ],
        metrics: { llmCalls: 2, latencyMs: 1, promptTokens: 5 },
      };
    },
  };
}

function fixedRouter(
  route: ProductionRoute,
  reason = "motivo-fixo",
  costs = { llmCalls: 1, promptTokens: 12 },
): ProductionRouter & { decideCalls: number } {
  const router = {
    decideCalls: 0,
    async decide() {
      router.decideCalls += 1;
      return { route, reason, ...costs };
    },
  };
  return router;
}

function approvingCritic(): Critic {
  return {
    async evaluate() {
      return { approved: true, feedback: "ok", llmCalls: 0, promptTokens: 0 };
    },
  };
}

const emptyBudgets = { summary: 200, window: 1200, memory: 300 };

function baseSections(message: string) {
  return {
    system: "",
    message,
    summary: "",
    window: [] as { role: "user" | "assistant"; content: string }[],
    memory: [] as { fact: string; score: number }[],
  };
}

test("runProductionGraph executes only the routed strategy", async () => {
  const reactCalls: string[] = [];
  const planCalls: string[] = [];
  const router = fixedRouter("plan-and-execute", "sequência");
  const result = await runProductionGraph({
    message: "investigar e abrir",
    sections: baseSections("investigar e abrir"),
    budgets: emptyBudgets,
    maxIterations: 8,
    maxReflections: 2,
    registry: {
      react: fakeStrategy("react", reactCalls),
      "plan-and-execute": fakeStrategy("plan-and-execute", planCalls, "pe-ok"),
    },
    router,
    critic: approvingCritic(),
  });

  assert.equal(planCalls.length, 1);
  assert.equal(reactCalls.length, 0);
  assert.equal(result.answer, "pe-ok");
  assert.equal(result.trace[0]?.type, "route");
  assert.equal(result.trace[0]?.type === "route" && result.trace[0].route, "plan-and-execute");
  assert.equal(result.trace[0]?.type === "route" && result.trace[0].override, false);
  assert.equal(result.metrics.llmCalls, 3);
  assert.equal(result.metrics.promptTokens, 17);
});

test("runProductionGraph passes buildContext prompt to the strategy", async () => {
  const reactCalls: string[] = [];
  await runProductionGraph({
    message: "agora",
    sections: {
      system: "",
      message: "agora",
      summary: "resumo antigo",
      window: [{ role: "user", content: "antes" }],
      memory: [{ fact: "prefiro curtidas", score: 0.9 }],
    },
    budgets: emptyBudgets,
    maxIterations: 8,
    maxReflections: 2,
    registry: {
      react: fakeStrategy("react", reactCalls),
      "plan-and-execute": fakeStrategy("plan-and-execute", []),
    },
    router: fixedRouter("react"),
  });

  assert.equal(reactCalls.length, 1);
  assert.match(reactCalls[0]!, /resumo antigo|Resumo/i);
  assert.match(reactCalls[0]!, /antes/);
  assert.match(reactCalls[0]!, /prefiro curtidas|Memória/i);
  assert.match(reactCalls[0]!, /agora/);
});

test("strategy events are stamped with the effective route node", async () => {
  const result = await runProductionGraph({
    message: "listar",
    sections: baseSections("listar"),
    budgets: emptyBudgets,
    maxIterations: 8,
    maxReflections: 2,
    registry: {
      react: fakeStrategy("react", []),
      "plan-and-execute": fakeStrategy("plan-and-execute", []),
    },
    router: fixedRouter("react"),
  });

  assert.equal(result.trace[0]?.node, "router");
  for (const event of result.trace.slice(1)) {
    assert.equal(event.node, "react");
  }
  assert.ok(result.trace.every((event) => event.node !== undefined));
});

test("override skips decide and uses fixed reason", async () => {
  const reactCalls: string[] = [];
  const planCalls: string[] = [];
  const router = fixedRouter("react");
  const result = await runProductionGraph({
    message: "forçar pe",
    sections: baseSections("forçar pe"),
    budgets: emptyBudgets,
    override: "plan-and-execute",
    maxIterations: 8,
    maxReflections: 2,
    registry: {
      react: fakeStrategy("react", reactCalls),
      "plan-and-execute": fakeStrategy("plan-and-execute", planCalls, "forced"),
    },
    router,
  });

  assert.equal(router.decideCalls, 0);
  assert.equal(planCalls.length, 1);
  assert.equal(reactCalls.length, 0);
  assert.equal(result.answer, "forced");
  assert.equal(result.trace[0]?.type, "route");
  if (result.trace[0]?.type === "route") {
    assert.equal(result.trace[0].override, true);
    assert.equal(result.trace[0].reason, OVERRIDE_REASON);
    assert.equal(result.trace[0].route, "plan-and-execute");
    assert.equal(result.trace[0].node, "router");
  }
  assert.equal(result.metrics.llmCalls, 2);
  assert.equal(result.metrics.promptTokens, 5);
});

test("override reflection runs wrapped react once", async () => {
  const reactCalls: string[] = [];
  const router = fixedRouter("plan-and-execute");
  const result = await runProductionGraph({
    message: "revisar",
    sections: baseSections("revisar"),
    budgets: emptyBudgets,
    override: "reflection",
    maxIterations: 8,
    maxReflections: 2,
    registry: {
      react: fakeStrategy("react", reactCalls, "reflected"),
      "plan-and-execute": fakeStrategy("plan-and-execute", []),
    },
    router,
    critic: approvingCritic(),
  });

  assert.equal(router.decideCalls, 0);
  assert.equal(reactCalls.length, 1);
  assert.equal(result.answer, "reflected");
  assert.ok(result.trace.every((e) => e.type !== "route" || e.route === "reflection"));
  assert.ok(
    result.trace
      .filter((e) => e.type !== "route")
      .every((e) => e.node === "reflection"),
  );
});

test("invalid router decision does not run a strategy", async () => {
  const reactCalls: string[] = [];
  const badRouter: ProductionRouter = {
    async decide() {
      return {
        route: "react",
        reason: "   ",
        llmCalls: 1,
        promptTokens: 1,
      };
    },
  };

  await assert.rejects(
    () =>
      runProductionGraph({
        message: "x",
        sections: baseSections("x"),
        budgets: emptyBudgets,
        maxIterations: 8,
        maxReflections: 2,
        registry: {
          react: fakeStrategy("react", reactCalls),
          "plan-and-execute": fakeStrategy("plan-and-execute", []),
        },
        router: badRouter,
      }),
    (error: unknown) =>
      error instanceof InvalidRouteError &&
      error.message === "Não foi possível decidir a rota.",
  );
  assert.equal(reactCalls.length, 0);
});

test("isProductionRoute still rejects sketch aliases", () => {
  assert.equal(isProductionRoute("planExecute"), false);
  assert.equal(isProductionRoute("reflect"), false);
});
