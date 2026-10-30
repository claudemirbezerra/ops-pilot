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
  if (tool === "open_incident") {
    const title = String(args.title ?? "").trim();
    const service = String(args.service ?? "").trim();
    const severity = String(args.severity ?? "").trim();
    const bits = [
      title.length > 0 ? `"${title}"` : null,
      service.length > 0 ? service : null,
      severity.length > 0 ? severity : null,
    ].filter((bit): bit is string => bit !== null);
    return bits.length > 0
      ? `Abrir incidente: ${bits.join(" · ")}`
      : "Abrir incidente";
  }

  if (tool === "resolver_incident") {
    const id =
      args.id !== undefined && args.id !== null && String(args.id).length > 0
        ? `#${String(args.id)}`
        : "";
    const summary = String(args.summary ?? "").trim();
    if (id.length > 0 && summary.length > 0) {
      return `Resolver incidente ${id}: ${summary}`;
    }
    if (id.length > 0) {
      return `Resolver incidente ${id}`;
    }
    if (summary.length > 0) {
      return `Resolver incidente: ${summary}`;
    }
    return "Resolver incidente";
  }

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

/** Walk wrapped LangGraph / aggregate errors to recover the gated-tool pause. */
export function findApprovalError(
  error: unknown,
  seen: Set<unknown> = new Set(),
): HumanApprovalRequiredError | null {
  if (error == null || (typeof error !== "object" && typeof error !== "function")) {
    return null;
  }
  if (seen.has(error)) {
    return null;
  }
  seen.add(error);

  if (error instanceof HumanApprovalRequiredError) {
    return error;
  }

  if (error instanceof Error) {
    const withExtras = error as Error & {
      cause?: unknown;
      errors?: unknown[];
    };
    const fromCause = findApprovalError(withExtras.cause, seen);
    if (fromCause) {
      return fromCause;
    }
    if (Array.isArray(withExtras.errors)) {
      for (const nested of withExtras.errors) {
        const found = findApprovalError(nested, seen);
        if (found) {
          return found;
        }
      }
    }
  }

  return null;
}
