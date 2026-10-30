import type { ToolName, TraceEvent } from "./strategy.js";

/** Tools that pause for human approval before invoke (MVP). */
export const TOOLS_REQUIRING_HUMAN_APPROVAL: ReadonlySet<ToolName> = new Set([
  "open_incident",
  "resolver_incident",
]);

export function requiresHumanApproval(tool: string): boolean {
  return TOOLS_REQUIRING_HUMAN_APPROVAL.has(tool as ToolName);
}

export function describePendingApproval(
  tool: string,
  args: Record<string, unknown>,
): string {
  const keys = Object.keys(args);
  if (keys.length === 0) {
    return `${tool}`;
  }
  const summary = keys
    .slice(0, 3)
    .map((key) => `${key}=${String(args[key])}`)
    .join(", ");
  return `${tool} (${summary})`;
}

/** Thrown (or captured) when a gated tool would run before human approval. */
export class HumanApprovalRequiredError extends Error {
  readonly tool: ToolName;
  readonly args: Record<string, unknown>;
  readonly trace: TraceEvent[];
  readonly llmCalls: number;
  readonly promptTokens: number;

  constructor(input: {
    tool: ToolName;
    args: Record<string, unknown>;
    trace?: TraceEvent[];
    llmCalls?: number;
    promptTokens?: number;
  }) {
    super(`Aprovação humana necessária: ${input.tool}`);
    this.name = "HumanApprovalRequiredError";
    this.tool = input.tool;
    this.args = input.args;
    this.trace = input.trace ?? [];
    this.llmCalls = input.llmCalls ?? 0;
    this.promptTokens = input.promptTokens ?? 0;
  }
}
