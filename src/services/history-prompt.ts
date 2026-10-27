import type {
  ConversationMessage,
  ConversationRole,
} from "../domain/types.js";

export const HISTORY_LIMIT = 12;

const ROLE_LABEL: Record<ConversationRole, string> = {
  user: "Plantonista",
  assistant: "Copiloto",
};

export function selectHistoryWindow(
  prior: readonly ConversationMessage[],
  currentText: string,
): ConversationMessage[] {
  const current: ConversationMessage = { role: "user", content: currentText };
  return [...prior, current].slice(-HISTORY_LIMIT);
}

export function renderHistoryPrompt(
  messages: readonly ConversationMessage[],
): string {
  return messages
    .map((message) => `${ROLE_LABEL[message.role]}: ${message.content}`)
    .join("\n");
}
