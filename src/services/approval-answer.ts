import type { ApprovalDecision, PendingApproval } from "../domain/types.js";

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function formatOpenIncidentAnswer(observation: string): string | null {
  const data = tryParseJson(observation);
  if (!data || typeof data.id !== "number") {
    return null;
  }
  const lines = [`Incidente **#${data.id}** aberto com sucesso.`];
  if (typeof data.title === "string" && data.title.trim().length > 0) {
    lines.push(`- **Título:** ${data.title}`);
  }
  const service =
    typeof data.serviceSlug === "string"
      ? data.serviceSlug
      : typeof data.service === "string"
        ? data.service
        : "";
  if (service.trim().length > 0) {
    lines.push(`- **Serviço:** ${service}`);
  }
  if (typeof data.severity === "string" && data.severity.trim().length > 0) {
    lines.push(`- **Severidade:** ${data.severity}`);
  }
  if (typeof data.status === "string" && data.status.trim().length > 0) {
    lines.push(`- **Status:** ${data.status}`);
  }
  return lines.join("\n");
}

function formatResolveIncidentAnswer(observation: string): string | null {
  const data = tryParseJson(observation);
  if (!data || typeof data.id !== "number") {
    return null;
  }
  const summary =
    typeof data.summary === "string" && data.summary.trim().length > 0
      ? data.summary.trim()
      : null;
  if (summary) {
    return `Incidente **#${data.id}** resolvido: ${summary}`;
  }
  return `Incidente **#${data.id}** resolvido.`;
}

/** Human-readable answer after approve/deny for the war room. */
export function formatApprovalAnswer(
  decision: ApprovalDecision,
  pending: Pick<PendingApproval, "tool" | "description">,
  observation: string,
): string {
  if (decision === "deny") {
    return `Negado pelo plantonista: ${pending.description}`;
  }

  if (pending.tool === "open_incident") {
    const formatted = formatOpenIncidentAnswer(observation);
    if (formatted) {
      return formatted;
    }
  }

  if (pending.tool === "resolver_incident") {
    const formatted = formatResolveIncidentAnswer(observation);
    if (formatted) {
      return formatted;
    }
  }

  return `Aprovado: ${pending.description}\n\nResultado: ${observation}`;
}
