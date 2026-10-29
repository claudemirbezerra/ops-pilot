import assert from "node:assert/strict";
import test from "node:test";

import type { Critic } from "./critic.js";
import {
  OVERRIDE_REASON,
  ROUTER_PROMPT,
  buildRouteEvent,
  isProductionRoute,
  resolveProductionStrategy,
  stampTrace,
} from "./production-route.js";
import type { ReasoningStrategy, StrategyResult, TraceEvent } from "./strategy.js";

function fakeStrategy(
  name: "react" | "plan-and-execute",
  calls: string[],
): ReasoningStrategy {
  return {
    name,
    async run(input: string): Promise<StrategyResult> {
      calls.push(`${name}:${input}`);
      return {
        answer: `${name}-ok`,
        trace: [
          { type: "thought", content: "t" },
          { type: "answer", content: `${name}-ok` },
        ],
        metrics: { llmCalls: 1, latencyMs: 1, promptTokens: 2 },
      };
    },
  };
}

function approvingCritic(): Critic {
  return {
    async evaluate() {
      return { approved: true, feedback: "ok", llmCalls: 0, promptTokens: 0 };
    },
  };
}

test("isProductionRoute accepts only the three exact routes", () => {
  assert.equal(isProductionRoute("react"), true);
  assert.equal(isProductionRoute("plan-and-execute"), true);
  assert.equal(isProductionRoute("reflection"), true);
  assert.equal(isProductionRoute(""), false);
  assert.equal(isProductionRoute("React"), false);
  assert.equal(isProductionRoute("reflect:react"), false);
  assert.equal(isProductionRoute("planExecute"), false);
});

test("stampTrace sets node on every event", () => {
  const events: TraceEvent[] = [
    { type: "thought", content: "a" },
    { type: "answer", content: "b" },
  ];
  const stamped = stampTrace(events, "react");
  assert.deepEqual(
    stamped.map((e) => e.node),
    ["react", "react"],
  );
  assert.equal(events[0]!.node, undefined);
});

test("buildRouteEvent always has node router", () => {
  const event = buildRouteEvent({
    route: "react",
    reason: OVERRIDE_REASON,
    override: true,
  });
  assert.equal(event.type, "route");
  assert.equal(event.node, "router");
  assert.equal(event.override, true);
  assert.equal(event.reason, OVERRIDE_REASON);
});

test("ROUTER_PROMPT includes the three table associations", () => {
  assert.match(ROUTER_PROMPT, /consulta ou uma ação direta/);
  assert.match(ROUTER_PROMPT, /\breact\b/);
  assert.match(ROUTER_PROMPT, /sequência de passos dependentes/);
  assert.match(ROUTER_PROMPT, /plan-and-execute/);
  assert.match(ROUTER_PROMPT, /revisão, conferência ou maior confiança/);
  assert.match(ROUTER_PROMPT, /\breflection\b/);
  assert.doesNotMatch(ROUTER_PROMPT, /planExecute/);
  assert.doesNotMatch(ROUTER_PROMPT, /\breflect\b(?!:)/);
  assert.match(ROUTER_PROMPT, /Não invente uma quarta rota/);
});

test("resolveProductionStrategy reflection wraps react once", async () => {
  const reactCalls: string[] = [];
  const planCalls: string[] = [];
  const strategy = resolveProductionStrategy({
    route: "reflection",
    reflect: false,
    registry: {
      react: fakeStrategy("react", reactCalls),
      "plan-and-execute": fakeStrategy("plan-and-execute", planCalls),
    },
    critic: approvingCritic(),
  });
  assert.equal(strategy.name, "reflect:react");
  const result = await strategy.run("pedido", { maxIterations: 8, maxReflections: 2 });
  assert.equal(reactCalls.length, 1);
  assert.equal(planCalls.length, 0);
  assert.equal(result.answer, "react-ok");
  assert.ok(result.trace.some((e) => e.type === "critique"));
});

test("resolveProductionStrategy reflect true on reflection does not double-wrap", async () => {
  const reactCalls: string[] = [];
  let criticCalls = 0;
  const critic: Critic = {
    async evaluate() {
      criticCalls += 1;
      return { approved: true, feedback: "ok", llmCalls: 0, promptTokens: 0 };
    },
  };
  const strategy = resolveProductionStrategy({
    route: "reflection",
    reflect: true,
    registry: {
      react: fakeStrategy("react", reactCalls),
      "plan-and-execute": fakeStrategy("plan-and-execute", []),
    },
    critic,
  });
  await strategy.run("pedido", { maxIterations: 8, maxReflections: 2 });
  assert.equal(reactCalls.length, 1);
  assert.equal(criticCalls, 1);
});

test("resolveProductionStrategy reflect true on react wraps once", async () => {
  const reactCalls: string[] = [];
  const strategy = resolveProductionStrategy({
    route: "react",
    reflect: true,
    registry: {
      react: fakeStrategy("react", reactCalls),
      "plan-and-execute": fakeStrategy("plan-and-execute", []),
    },
    critic: approvingCritic(),
  });
  assert.equal(strategy.name, "reflect:react");
  await strategy.run("pedido", { maxIterations: 8, maxReflections: 2 });
  assert.equal(reactCalls.length, 1);
});
