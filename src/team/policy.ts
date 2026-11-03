import { requiresHumanApproval } from "../agents/approval-gate.js";
import {
  buildLimitReachedAnswer,
  type TeamNext,
  type ToolName,
  type TraceEvent,
} from "../agents/strategy.js";
import { InvalidTeamDecisionError } from "../domain/errors.js";
import type { TeamRoleName } from "./board.js";

export const TEAM_MAX_HANDOFFS = 8;

export const TEAM_DENIED_OBSERVATION =
  "Ferramenta indisponível para este papel.";

const TEAM_NEXTS = [
  "analista",
  "planejador",
  "executor",
  "encerrar",
] as const satisfies readonly TeamNext[];

export const ANALISTA_ALLOWLIST = [
  "list_alertas",
  "list_incidents",
  "consultar_runbook",
  "check_provider_status",
] as const satisfies readonly ToolName[];

export const PLANEJADOR_ALLOWLIST = [] as const satisfies readonly ToolName[];

export const EXECUTOR_ALLOWLIST = [
  "open_incident",
  "resolver_incident",
] as const satisfies readonly ToolName[];

export const ANALISTA_PROMPT = `Você é o ANALISTA do plantão. Sua única função: produzir diagnóstico FACTUAL do estado atual, com as ferramentas de leitura.
Liste: alertas disparando (com data e severidade), incidentes recentes (abertos e resolvidos), runbooks relevantes, status dos provedores, janelas/fatos conhecidos do time.
NÃO proponha soluções. NÃO abra nem resolva nada. Formato: tópicos telegráficos.
Seja cético: se um dado não está nas observações, não afirme.
Relate apenas fatos. Não proponha abertura, resolução, plano de passos nem próxima ação.`;

export const PLANEJADOR_PROMPT = `Você é o PLANEJADOR do plantão. Escreva uma lista ordenada de passos.
Não chame ferramentas.
Não abra nem resolva incidentes. Cada passo precisa de texto.`;

export const EXECUTOR_PROMPT = `Você é o EXECUTOR do plantão. Só pode pedir open_incident ou resolver_incident.
Não contorne a aprovação humana.
Não liste alertas nem consulte runbook. A abertura e a resolução esperam o plantonista.`;

export const SUPERVISOR_PROMPT = `Você é o SUPERVISOR do plantão OpsPilot. Você não usa ferramentas e não escreve achados, plano nem incidente.
Papéis disponíveis:
- analista: diagnóstico factual com ferramentas de leitura. Não propõe solução.
- planejador: lista ordenada de passos, sem ferramentas.
- executor: só abrir ou resolver incidente, sempre com aprovação humana.
Critérios de sequência: se faltam fatos, next=analista; se faltam passos, next=planejador; se o plano pede incidente, next=executor; se o quadro já sustenta a resposta, next=encerrar.
brief é a instrução de trabalho para o próximo nó, ou o resumo final se encerrar. Não devolva brief vazio.`;

const ALLOWLIST: Record<TeamRoleName, readonly string[]> = {
  analista: ANALISTA_ALLOWLIST,
  planejador: PLANEJADOR_ALLOWLIST,
  executor: EXECUTOR_ALLOWLIST,
};

export type TeamToolUse =
  | { kind: "invoke" }
  | { kind: "deny" }
  | { kind: "approval" };

export function parseTeamDecision(raw: unknown): {
  next: TeamNext;
  brief: string;
} {
  const record =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : undefined;
  const next = record?.next;
  const brief = typeof record?.brief === "string" ? record.brief.trim() : "";
  if (
    typeof next !== "string" ||
    !(TEAM_NEXTS as readonly string[]).includes(next) ||
    brief.length < 1
  ) {
    throw new InvalidTeamDecisionError();
  }
  return { next: next as TeamNext, brief };
}

export function buildHandoffEvent(
  next: TeamNext,
  brief: string,
): Extract<TraceEvent, { type: "handoff" }> {
  return { type: "handoff", next, brief, node: "team" };
}

export function ceilingAnswer(): string {
  return buildLimitReachedAnswer(TEAM_MAX_HANDOFFS);
}

export function resolveTeamToolUse(
  role: TeamRoleName,
  toolName: string,
): TeamToolUse {
  if (!ALLOWLIST[role].includes(toolName)) {
    return { kind: "deny" };
  }
  if (requiresHumanApproval(toolName)) {
    return { kind: "approval" };
  }
  return { kind: "invoke" };
}
