import type { StoreHolder } from "./store.js";

export type ToolName = "list_alertas" | "open_incident" | "resolver_incident";

export type TraceEvent =
  | { type: "thought"; content: string }
  | { type: "action"; tool: ToolName; args: Record<string, unknown> }
  | { type: "observation"; content: string }
  | { type: "plan"; steps: string[] }
  | { type: "critique"; content: string }
  | { type: "answer"; content: string };

export type Metrics = {
  llmCalls: number;
  latencyMs: number;
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
  /** Optional in-memory store for tools (bench). Default: JSON DB holder. */
  storeHolder?: StoreHolder;
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
    metrics: { llmCalls: 0, latencyMs: 0 },
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
    },
  };
}
