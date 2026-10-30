import type { TraceEvent } from "../agents/strategy.js";
import type { ObsLogger } from "../obs/logger.js";
import type { RequestStore } from "../domain/types.js";

/**
 * Espelha o fluxo do answerNode: grava request + trace_events e emite log só de metadados.
 */
export function persistChatRequest(input: {
  requestId: string;
  metrics: Record<string, unknown>;
  trace: TraceEvent[];
  requestStore: RequestStore;
  logger: ObsLogger;
  createdAt?: number;
  route?: string;
}): void {
  const createdAt = input.createdAt ?? Date.now();
  const { requestId, metrics, trace, requestStore, logger } = input;

  trace.forEach((event, seq) => {
    logger.logTraceEvent({
      requestId,
      seq,
      type: event.type,
      ...(event.node !== undefined ? { node: event.node } : {}),
      ts: createdAt,
    });
  });

  requestStore.save({
    id: requestId,
    createdAt,
    metrics,
    trace,
  });

  const promptTokens =
    typeof metrics.promptTokens === "number" ? metrics.promptTokens : undefined;

  logger.logRequestLife({
    requestId,
    event: "request_end",
    status: "ok",
    ts: createdAt,
    type: "done",
    node: "answer",
    ...(input.route !== undefined ? { route: input.route } : {}),
    ...(promptTokens !== undefined ? { tokens: promptTokens } : {}),
  });
}
