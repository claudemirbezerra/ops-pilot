export const HISTORY_LIMIT = 12;

export function selectHistoryWindow(
  _prior: readonly { role: string; content: string }[],
  _currentText: string,
): { role: string; content: string }[] {
  throw new Error("not implemented");
}

export function renderHistoryPrompt(
  _messages: readonly { role: string; content: string }[],
): string {
  throw new Error("not implemented");
}
