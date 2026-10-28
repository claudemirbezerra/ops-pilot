import type { ConversationMessage } from "../domain/types.js";
import { renderHistoryPrompt, renderSummaryPrompt } from "../services/history-prompt.js";
import { renderMemoryPrompt } from "../services/memory-prompt.js";
import { estimateTokens } from "./tokens.js";

export type ContextBudgets = {
  summary: number;
  window: number;
  memory: number;
};

export type MemoryItem = { fact: string; score: number };

export type ContextSectionInput = {
  system: string;
  message: string;
  summary: string;
  window: readonly ConversationMessage[];
  memory: readonly MemoryItem[];
};

export type BuiltContext = {
  prompt: string;
  sections: {
    system: string;
    message: string;
    summary: string;
    window: string;
    memory: string;
  };
  kept: {
    window: ConversationMessage[];
    memory: MemoryItem[];
  };
};

const DEFAULT_BUDGETS: ContextBudgets = {
  summary: 200,
  window: 1200,
  memory: 300,
};

type CutPolicy =
  | "never"
  | "oldest-first"
  | "lowest-score-first"
  | "truncate-prefix";

type SectionName = "system" | "summary" | "window" | "memory";

type SectionSpec = {
  name: SectionName;
  budget: number;
  cut: CutPolicy;
  system?: string;
  summaryText?: string;
  window?: readonly ConversationMessage[];
  memory?: readonly MemoryItem[];
};

type FittedSection = {
  name: SectionName;
  text: string;
  keptWindow?: ConversationMessage[];
  keptMemory?: MemoryItem[];
};

function parseBudget(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    return fallback;
  }
  return Number.parseInt(raw, 10);
}

/** Resolve tetos from env map (defaults: summary 200, window 1200, memory 300). */
export function resolveContextBudgets(
  env: Record<string, string | undefined> = process.env,
): ContextBudgets {
  return {
    summary: parseBudget(env.CONTEXT_BUDGET_SUMMARY, DEFAULT_BUDGETS.summary),
    window: parseBudget(env.CONTEXT_BUDGET_WINDOW, DEFAULT_BUDGETS.window),
    memory: parseBudget(env.CONTEXT_BUDGET_MEMORY, DEFAULT_BUDGETS.memory),
  };
}

function section(spec: SectionSpec): SectionSpec {
  return spec;
}

function fitWindow(
  messages: readonly ConversationMessage[],
  budget: number,
): { text: string; kept: ConversationMessage[] } {
  let kept = [...messages];
  while (
    kept.length > 0 &&
    estimateTokens(renderHistoryPrompt(kept)) > budget
  ) {
    kept = kept.slice(1);
  }
  const text = kept.length === 0 ? "" : renderHistoryPrompt(kept);
  return { text, kept };
}

function fitMemory(
  items: readonly MemoryItem[],
  budget: number,
): { text: string; kept: MemoryItem[] } {
  if (items.length === 0) {
    return { text: "", kept: [] };
  }
  const ranked = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.score !== b.item.score) {
        return a.item.score - b.item.score;
      }
      return a.index - b.index;
    });

  let drop = new Set<number>();
  let candidates = [...items];
  while (
    candidates.length > 0 &&
    estimateTokens(renderMemoryPrompt(candidates)) > budget
  ) {
    const next = ranked.find((entry) => !drop.has(entry.index));
    if (next === undefined) {
      break;
    }
    drop = new Set([...drop, next.index]);
    candidates = items.filter((_, index) => !drop.has(index));
  }

  const kept = items.filter((_, index) => !drop.has(index));
  const text = kept.length === 0 ? "" : renderMemoryPrompt(kept);
  return { text, kept };
}

function fitSummary(raw: string, budget: number): string {
  const rendered = renderSummaryPrompt(raw);
  if (rendered.length === 0) {
    return "";
  }
  if (estimateTokens(rendered) <= budget) {
    return rendered;
  }
  // Truncate whole block by char cap so estimateTokens ≤ budget.
  const maxChars = budget * 4;
  if (maxChars <= 0) {
    return "";
  }
  let truncated = rendered.slice(0, maxChars);
  while (truncated.length > 0 && estimateTokens(truncated) > budget) {
    truncated = truncated.slice(0, truncated.length - 1);
  }
  return truncated;
}

function fitToBudget(spec: SectionSpec): FittedSection {
  switch (spec.cut) {
    case "never": {
      if (spec.name === "system") {
        return { name: "system", text: spec.system ?? "" };
      }
      return { name: spec.name, text: "" };
    }
    case "truncate-prefix": {
      const text = fitSummary(spec.summaryText ?? "", spec.budget);
      return { name: "summary", text };
    }
    case "oldest-first": {
      const { text, kept } = fitWindow(spec.window ?? [], spec.budget);
      return { name: "window", text, keptWindow: kept };
    }
    case "lowest-score-first": {
      const { text, kept } = fitMemory(spec.memory ?? [], spec.budget);
      return { name: "memory", text, keptMemory: kept };
    }
    default: {
      const _exhaustive: never = spec.cut;
      return _exhaustive;
    }
  }
}

function currentUserLine(message: string): string {
  return renderHistoryPrompt([{ role: "user", content: message }]);
}

function assemble(
  fitted: readonly FittedSection[],
  message: string,
): BuiltContext {
  const byName = new Map(fitted.map((item) => [item.name, item]));
  const system = byName.get("system")?.text ?? "";
  const summary = byName.get("summary")?.text ?? "";
  const windowText = byName.get("window")?.text ?? "";
  const memory = byName.get("memory")?.text ?? "";
  const keptWindow = byName.get("window")?.keptWindow ?? [];
  const keptMemory = byName.get("memory")?.keptMemory ?? [];

  const messageLine = currentUserLine(message);
  const historyPart =
    windowText.length > 0 ? `${windowText}\n${messageLine}` : messageLine;

  const parts = [system, memory, summary, historyPart].filter(
    (part) => part.length > 0,
  );

  return {
    prompt: parts.join("\n\n"),
    sections: {
      system,
      message,
      summary,
      window: windowText,
      memory,
    },
    kept: {
      window: keptWindow,
      memory: keptMemory,
    },
  };
}

/**
 * Monta o prompt composto com teto por seção.
 * system + message intocáveis; summary/window/memory orçados.
 */
export function buildContext(
  input: ContextSectionInput,
  budgets: ContextBudgets,
): BuiltContext {
  const sections = [
    section({
      name: "system",
      system: input.system,
      budget: Number.POSITIVE_INFINITY,
      cut: "never",
    }),
    section({
      name: "summary",
      summaryText: input.summary,
      budget: budgets.summary,
      cut: "truncate-prefix",
    }),
    section({
      name: "window",
      window: input.window,
      budget: budgets.window,
      cut: "oldest-first",
    }),
    section({
      name: "memory",
      memory: input.memory,
      budget: budgets.memory,
      cut: "lowest-score-first",
    }),
  ];
  const fitted = sections.map(fitToBudget);
  return assemble(fitted, input.message);
}
