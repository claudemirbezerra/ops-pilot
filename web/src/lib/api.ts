import { getApiBaseUrl, normalizeApiBase } from "./storage";
import type { TraceEvent } from "./trace";

export type ChatSuccess = {
  kind: "ok";
  requestId: string;
  answer: string;
  trace: TraceEvent[];
  metrics: Record<string, unknown>;
  conversationId?: string;
};

export type ChatPending = {
  kind: "pending";
  requestId: string;
  approvalId: string;
  pending: {
    tool: string;
    args: Record<string, unknown>;
    description: string;
  };
  trace: TraceEvent[];
  metrics: Record<string, unknown>;
  conversationId?: string;
};

export type ChatFailure = {
  kind: "error";
  status?: number;
  message: string;
};

export type ChatResponse = ChatSuccess | ChatPending | ChatFailure;

export type ApprovalSuccess = {
  kind: "ok";
  decision: "approve" | "deny";
  answer: string;
  trace: TraceEvent[];
  requestId: string;
};

export function buildChatUrl(base: string): string {
  return `${normalizeApiBase(base)}/opspilot/chat`;
}

export function buildApprovalUrl(base: string, approvalId: string): string {
  return `${normalizeApiBase(base)}/opspilot/approvals/${encodeURIComponent(approvalId)}`;
}

export async function postChat(
  message: string,
  baseUrl: string = getApiBaseUrl(),
): Promise<ChatResponse> {
  const url = buildChatUrl(baseUrl);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const json = (await response.json()) as Record<string, unknown>;

    if (response.status === 202) {
      const pending = json.pending as ChatPending["pending"] | undefined;
      if (
        typeof json.approvalId !== "string" ||
        pending === undefined ||
        typeof pending.tool !== "string"
      ) {
        return {
          kind: "error",
          status: 202,
          message: "Pendência incompleta na resposta 202.",
        };
      }
      return {
        kind: "pending",
        requestId: String(json.requestId ?? ""),
        approvalId: json.approvalId,
        pending: {
          tool: pending.tool,
          args: (pending.args ?? {}) as Record<string, unknown>,
          description: String(pending.description ?? pending.tool),
        },
        trace: Array.isArray(json.trace) ? (json.trace as TraceEvent[]) : [],
        metrics: (json.metrics as Record<string, unknown>) ?? {},
        ...(typeof json.conversationId === "string"
          ? { conversationId: json.conversationId }
          : {}),
      };
    }

    if (!response.ok) {
      const messageText =
        typeof json.message === "string"
          ? json.message
          : `Falha HTTP ${response.status}. Tente de novo.`;
      return { kind: "error", status: response.status, message: messageText };
    }

    return {
      kind: "ok",
      requestId: String(json.requestId ?? ""),
      answer: String(json.answer ?? ""),
      trace: Array.isArray(json.trace) ? (json.trace as TraceEvent[]) : [],
      metrics: (json.metrics as Record<string, unknown>) ?? {},
      ...(typeof json.conversationId === "string"
        ? { conversationId: json.conversationId }
        : {}),
    };
  } catch {
    return {
      kind: "error",
      message:
        "Não foi possível falar com a API. Confira a URL na engrenagem e se o OpsPilot está no ar.",
    };
  }
}

export async function postApproval(
  approvalId: string,
  decision: "approve" | "deny",
  baseUrl: string = getApiBaseUrl(),
): Promise<ApprovalSuccess | ChatFailure> {
  const url = buildApprovalUrl(baseUrl, approvalId);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return {
        kind: "error",
        status: response.status,
        message:
          typeof json.message === "string"
            ? json.message
            : `Falha ao enviar decisão (${response.status}).`,
      };
    }
    return {
      kind: "ok",
      decision: json.decision === "deny" ? "deny" : "approve",
      answer: String(json.answer ?? ""),
      trace: Array.isArray(json.trace) ? (json.trace as TraceEvent[]) : [],
      requestId: String(json.requestId ?? ""),
    };
  } catch {
    return {
      kind: "error",
      message: "Falha de rede ao enviar aprovação. Tente de novo.",
    };
  }
}
