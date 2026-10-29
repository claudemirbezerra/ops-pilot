import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import {
  buildContext,
  type BuiltContext,
  type ContextBudgets,
  type ContextSectionInput,
} from "../context/context-builder.js";
import { readPromptTokens } from "../context/tokens.js";
import { InvalidRouteError } from "../domain/errors.js";
import type { MemoryStore } from "../domain/types.js";
import type { Critic } from "./critic.js";
import { createModel } from "./model.js";
import {
  OVERRIDE_REASON,
  ROUTER_PROMPT,
  buildRouteEvent,
  isProductionRoute,
  resolveProductionStrategy,
  stampTrace,
  type ProductionRegistry,
  type ProductionRoute,
} from "./production-route.js";
import type { TraceEvent } from "./strategy.js";

export type RouteDecision = {
  route: ProductionRoute;
  reason: string;
  llmCalls: number;
  promptTokens: number;
};

export type ProductionRouter = {
  decide(message: string): Promise<RouteDecision>;
};

const routeSchema = z.object({
  route: z.enum(["react", "plan-and-execute", "reflection"]),
  reason: z.string().describe("Uma frase justificando a escolha"),
});

export function createLlmRouter(): ProductionRouter {
  return {
    async decide(message: string): Promise<RouteDecision> {
      try {
        const result = await createModel().withStructuredOutput(routeSchema, {
          includeRaw: true,
        }).invoke([
          ["system", ROUTER_PROMPT],
          ["user", message],
        ]);

        const parsed =
          result && typeof result === "object" && "parsed" in result
            ? (result as { parsed: z.infer<typeof routeSchema>; raw: unknown })
                .parsed
            : (result as z.infer<typeof routeSchema>);
        const raw =
          result && typeof result === "object" && "raw" in result
            ? (result as { raw: unknown }).raw
            : result;

        const reason = parsed.reason?.trim() ?? "";
        if (!isProductionRoute(parsed.route) || reason.length === 0) {
          throw new InvalidRouteError();
        }

        return {
          route: parsed.route,
          reason,
          llmCalls: 1,
          promptTokens: readPromptTokens(raw),
        };
      } catch (error: unknown) {
        if (error instanceof InvalidRouteError) {
          throw error;
        }
        throw new InvalidRouteError();
      }
    },
  };
}

const ProductionState = Annotation.Root({
  message: Annotation<string>,
  sections: Annotation<ContextSectionInput>,
  budgets: Annotation<ContextBudgets>,
  override: Annotation<ProductionRoute | undefined>,
  reflect: Annotation<boolean>,
  maxIterations: Annotation<number>,
  maxReflections: Annotation<number>,
  userId: Annotation<string | undefined>,
  memoryStore: Annotation<MemoryStore | undefined>,
  prompt: Annotation<string>,
  built: Annotation<BuiltContext | undefined>,
  route: Annotation<ProductionRoute | undefined>,
  reason: Annotation<string>,
  isOverride: Annotation<boolean>,
  answer: Annotation<string>,
  trace: Annotation<TraceEvent[]>,
  llmCalls: Annotation<number>,
  promptTokens: Annotation<number>,
  modelUsed: Annotation<string | undefined>,
});

type ProductionStateType = typeof ProductionState.State;

export type RunProductionGraphInput = {
  message: string;
  sections: ContextSectionInput;
  budgets: ContextBudgets;
  override?: ProductionRoute;
  reflect?: boolean;
  maxIterations: number;
  maxReflections: number;
  userId?: string;
  memoryStore?: MemoryStore;
  registry: ProductionRegistry;
  critic?: Critic;
  router: ProductionRouter;
};

export type RunProductionGraphResult = {
  answer: string;
  trace: TraceEvent[];
  built: BuiltContext;
  metrics: {
    llmCalls: number;
    promptTokens: number;
    latencyMs: number;
    modelUsed?: string;
  };
};

function createProductionGraph(deps: {
  registry: ProductionRegistry;
  critic?: Critic;
  router: ProductionRouter;
}) {
  async function contextNode(
    state: ProductionStateType,
  ): Promise<Partial<ProductionStateType>> {
    const built = buildContext(state.sections, state.budgets);
    return {
      prompt: built.prompt,
      built,
    };
  }

  async function routerNode(
    state: ProductionStateType,
  ): Promise<Partial<ProductionStateType>> {
    if (state.override !== undefined) {
      return {
        route: state.override,
        reason: OVERRIDE_REASON,
        isOverride: true,
        trace: [
          ...state.trace,
          buildRouteEvent({
            route: state.override,
            reason: OVERRIDE_REASON,
            override: true,
          }),
        ],
        llmCalls: state.llmCalls,
        promptTokens: state.promptTokens,
      };
    }

    const decision = await deps.router.decide(state.message);
    const reason = decision.reason.trim();
    if (!isProductionRoute(decision.route) || reason.length === 0) {
      throw new InvalidRouteError();
    }

    return {
      route: decision.route,
      reason,
      isOverride: false,
      trace: [
        ...state.trace,
        buildRouteEvent({
          route: decision.route,
          reason,
          override: false,
        }),
      ],
      llmCalls: state.llmCalls + decision.llmCalls,
      promptTokens: state.promptTokens + decision.promptTokens,
    };
  }

  async function runStrategy(
    state: ProductionStateType,
    route: ProductionRoute,
  ): Promise<Partial<ProductionStateType>> {
    const strategy = resolveProductionStrategy({
      route,
      reflect: state.reflect,
      registry: deps.registry,
      critic: deps.critic,
    });
    const result = await strategy.run(state.prompt, {
      maxIterations: state.maxIterations,
      maxReflections: state.maxReflections,
      userId: state.userId,
      memoryStore: state.memoryStore,
    });
    return {
      answer: result.answer,
      trace: [...state.trace, ...stampTrace(result.trace, route)],
      llmCalls: state.llmCalls + result.metrics.llmCalls,
      promptTokens: state.promptTokens + result.metrics.promptTokens,
      modelUsed: result.metrics.modelUsed ?? state.modelUsed,
    };
  }

  async function reactNode(
    state: ProductionStateType,
  ): Promise<Partial<ProductionStateType>> {
    return runStrategy(state, "react");
  }

  async function planAndExecuteNode(
    state: ProductionStateType,
  ): Promise<Partial<ProductionStateType>> {
    return runStrategy(state, "plan-and-execute");
  }

  async function reflectionNode(
    state: ProductionStateType,
  ): Promise<Partial<ProductionStateType>> {
    return runStrategy(state, "reflection");
  }

  async function responseNode(
    _state: ProductionStateType,
  ): Promise<Partial<ProductionStateType>> {
    return {};
  }

  function pickRoute(
    state: ProductionStateType,
  ): ProductionRoute {
    if (!state.route || !isProductionRoute(state.route)) {
      throw new InvalidRouteError();
    }
    return state.route;
  }

  return new StateGraph(ProductionState)
    .addNode("context", contextNode)
    .addNode("router", routerNode)
    .addNode("react", reactNode)
    .addNode("plan-and-execute", planAndExecuteNode)
    .addNode("reflection", reflectionNode)
    .addNode("response", responseNode)
    .addEdge(START, "context")
    .addEdge("context", "router")
    .addConditionalEdges("router", pickRoute, {
      react: "react",
      "plan-and-execute": "plan-and-execute",
      reflection: "reflection",
    })
    .addEdge("react", "response")
    .addEdge("plan-and-execute", "response")
    .addEdge("reflection", "response")
    .addEdge("response", END)
    .compile();
}

export async function runProductionGraph(
  input: RunProductionGraphInput,
): Promise<RunProductionGraphResult> {
  const started = Date.now();
  const graph = createProductionGraph({
    registry: input.registry,
    critic: input.critic,
    router: input.router,
  });

  const finalState = await graph.invoke({
    message: input.message,
    sections: input.sections,
    budgets: input.budgets,
    override: input.override,
    reflect: input.reflect === true,
    maxIterations: input.maxIterations,
    maxReflections: input.maxReflections,
    userId: input.userId,
    memoryStore: input.memoryStore,
    prompt: "",
    built: undefined,
    route: undefined,
    reason: "",
    isOverride: false,
    answer: "",
    trace: [],
    llmCalls: 0,
    promptTokens: 0,
    modelUsed: undefined,
  });

  if (!finalState.built) {
    throw new Error("Nó context não montou o BuiltContext.");
  }

  return {
    answer: finalState.answer,
    trace: finalState.trace,
    built: finalState.built,
    metrics: {
      llmCalls: finalState.llmCalls,
      promptTokens: finalState.promptTokens,
      latencyMs: Date.now() - started,
      ...(finalState.modelUsed !== undefined
        ? { modelUsed: finalState.modelUsed }
        : {}),
    },
  };
}
