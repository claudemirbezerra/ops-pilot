export function renderMemoryPrompt(
  facts: readonly { fact: string }[],
): string {
  if (facts.length === 0) {
    return "";
  }
  const lines = facts.map((item) => `- ${item.fact}`);
  return ["Memória do plantonista:", ...lines].join("\n");
}
