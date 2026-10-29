import type { MemoryStore } from "../domain/types.js";
import type { OpsStore } from "./store.js";

export type ToolName =
  | "list_alertas"
  | "open_incident"
  | "resolver_incident"
  | "list_incidents"
  | "consultar_runbook"
  | "check_provider_status"
  | "forget_preference";

export type ProductionRoute = "react" | "plan-and-execute" | "reflection";

export type TraceNode =
  | "context"
  | "router"
  | "react"
  | "plan-and-execute"
  | "reflection"
  | "response";

export type TraceEvent =
  | { type: "thought"; content: string; node?: TraceNode }
  | {
      type: "action";
      tool: ToolName;
      args: Record<string, unknown>;
      node?: TraceNode;
    }
  | { type: "observation"; content: string; node?: TraceNode }
  | { type: "plan"; steps: string[]; node?: TraceNode }
  | { type: "critique"; content: string; node?: TraceNode }
  | { type: "answer"; content: string; node?: TraceNode }
  | { type: "summarize"; content: string; node?: TraceNode }
  | {
      type: "route";
      route: ProductionRoute;
      reason: string;
      override: boolean;
      node?: TraceNode;
    };

export type Metrics = {
  llmCalls: number;
  latencyMs: number;
  /** Soma real de prompt tokens das chamadas ao modelo neste resultado. */
  promptTokens: number;
};

export type StrategyResult = {
  answer: string;
  trace: TraceEvent[];
  metrics: Metrics;
};

export type StrategyName =
  | "react"
  | "plan-and-execute"
  | "reflect:react"
  | "reflect:plan-and-execute";

export type StrategyOptions = {
  maxIterations: number;
  /** Regenerations after reject; default 2 at the arena border. Inteiro ≥ 1. */
  maxReflections?: number;
  /** Optional OpsStore for tools (bench/arena inject InMemory). Default: SQLite file. */
  opsStore?: OpsStore;
  /** Optional plantonista id for memory tools (forget_preference). */
  userId?: string;
  /** Optional MemoryStore for memory tools. */
  memoryStore?: MemoryStore;
  /** Plan-and-Execute only: skip the replanner node. */
  noReplanner?: boolean;
};

export type ReasoningStrategy = {
  name: StrategyName;
  run(input: string, options: StrategyOptions): Promise<StrategyResult>;
};

export const EMPTY_INPUT_ANSWER =
  "Informe um pedido operacional (por exemplo: listar alertas em disparo ou abrir um incidente).";

export const LIMIT_REACHED_ANSWER =
  "Teto de iterações atingido antes de concluir o raciocínio.";

export const MODEL_UNAVAILABLE_ANSWER =
  "O modelo ficou indisponível durante a execução.";

export function isBlankInput(input: string): boolean {
  return input.trim().length === 0;
}

export function buildEmptyInputResult(): StrategyResult {
  return {
    answer: EMPTY_INPUT_ANSWER,
    trace: [{ type: "answer", content: EMPTY_INPUT_ANSWER }],
    metrics: { llmCalls: 0, latencyMs: 0, promptTokens: 0 },
  };
}

export function buildLimitReachedAnswer(maxIterations: number): string {
  return `${LIMIT_REACHED_ANSWER} (máximo: ${maxIterations}).`;
}

export async function runWithMetrics(
  work: () => Promise<Omit<StrategyResult, "metrics"> & { metrics?: Partial<Metrics> }>,
): Promise<StrategyResult> {
  const started = Date.now();
  const result = await work();
  return {
    answer: result.answer,
    trace: result.trace,
    metrics: {
      llmCalls: result.metrics?.llmCalls ?? 0,
      latencyMs: result.metrics?.latencyMs ?? Date.now() - started,
      promptTokens: result.metrics?.promptTokens ?? 0,
    },
  };
}
