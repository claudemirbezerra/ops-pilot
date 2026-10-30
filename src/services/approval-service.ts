import {
  describePendingApproval,
  requiresHumanApproval,
} from "../agents/approval-gate.js";
import { asObservation, createOpsTools } from "../agents/tools.js";
import { createDefaultOpsStore } from "../agents/store.js";
import type { TraceEvent } from "../agents/strategy.js";
import type { OpsStore } from "../agents/store.js";
import type {
  ApprovalDecision,
  ApprovalStore,
  PendingApproval,
} from "../domain/types.js";

export type ResolveApprovalInput = {
  approvalId: string;
  decision: ApprovalDecision;
  approvalStore: ApprovalStore;
  opsStore?: OpsStore;
};

export type ResolveApprovalResult = {
  requestId: string;
  approvalId: string;
  decision: ApprovalDecision;
  answer: string;
  trace: TraceEvent[];
  metrics: Record<string, unknown>;
  conversationId?: string;
};

export async function resolveApproval(
  input: ResolveApprovalInput,
): Promise<ResolveApprovalResult> {
  const pending = input.approvalStore.resolve(
    input.approvalId,
    input.decision,
  );

  const priorTrace = pending.trace as TraceEvent[];
  let observation: string;
  let answer: string;

  if (input.decision === "deny") {
    observation = `Negado pelo plantonista: ${pending.description}`;
    answer = observation;
  } else {
    if (!requiresHumanApproval(pending.tool)) {
      observation = `Ferramenta não gated após approve: ${pending.tool}`;
      answer = observation;
    } else {
      observation = await invokePendingTool(pending, input.opsStore);
      answer = `Aprovado: ${pending.description}. Resultado: ${observation}`;
    }
  }

  const trace: TraceEvent[] = [
    ...priorTrace,
    { type: "observation", content: observation },
    { type: "answer", content: answer },
  ];

  return {
    requestId: pending.requestId,
    approvalId: pending.id,
    decision: input.decision,
    answer,
    trace,
    metrics: { ...pending.metrics },
    ...(pending.conversationId !== undefined
      ? { conversationId: pending.conversationId }
      : {}),
  };
}

async function invokePendingTool(
  pending: PendingApproval,
  opsStore: OpsStore | undefined,
): Promise<string> {
  const store = opsStore ?? createDefaultOpsStore();
  const { tools } = createOpsTools(store);
  const selected = tools.find((item) => item.name === pending.tool);
  if (!selected) {
    return `Ferramenta desconhecida: ${pending.tool}`;
  }
  try {
    const invoke = selected.invoke.bind(selected) as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    const raw = await invoke(pending.args);
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch (error: unknown) {
    return asObservation(error);
  }
}

export function buildPendingDescription(
  tool: string,
  args: Record<string, unknown>,
): string {
  return describePendingApproval(tool, args);
}
