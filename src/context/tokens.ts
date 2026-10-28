/** Heurística barata: caracteres ÷ 4 (divisão inteira). */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

function asNonNegInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function readFromTokenUsage(tokenUsage: unknown): number | undefined {
  if (tokenUsage === null || typeof tokenUsage !== "object") {
    return undefined;
  }
  const record = tokenUsage as Record<string, unknown>;
  return (
    asNonNegInt(record.prompt_tokens) ?? asNonNegInt(record.promptTokens)
  );
}

/**
 * Lê prompt tokens do usage LangChain / provedor.
 * Prioridade: usage_metadata.input_tokens → response_metadata.tokenUsage →
 * campos diretos input_tokens / prompt_tokens / promptTokens → 0.
 */
export function readPromptTokens(source: unknown): number {
  if (source === null || source === undefined) {
    return 0;
  }
  if (typeof source !== "object") {
    return 0;
  }

  const record = source as Record<string, unknown>;

  const usageMeta = record.usage_metadata;
  if (usageMeta !== null && typeof usageMeta === "object") {
    const input = asNonNegInt(
      (usageMeta as Record<string, unknown>).input_tokens,
    );
    if (input !== undefined) {
      return input;
    }
  }

  const responseMeta = record.response_metadata;
  if (responseMeta !== null && typeof responseMeta === "object") {
    const fromUsage = readFromTokenUsage(
      (responseMeta as Record<string, unknown>).tokenUsage,
    );
    if (fromUsage !== undefined) {
      return fromUsage;
    }
  }

  return (
    asNonNegInt(record.input_tokens) ??
    asNonNegInt(record.prompt_tokens) ??
    asNonNegInt(record.promptTokens) ??
    0
  );
}
