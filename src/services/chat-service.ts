import {
  resolveChannelStrategy,
  type ChannelRegistry,
} from "../agents/index.js";
import type { Critic } from "../agents/critic.js";
import {
  createLlmConversationSummarizer,
  type ConversationSummarizer,
} from "../agents/conversation-summarizer.js";
import {
  createLlmLearningExtractor,
  type LearningExtractor,
} from "../agents/learning-extractor.js";
import {
  buildEmptyInputResult,
  isBlankInput,
  type StrategyResult,
  type TraceEvent,
} from "../agents/strategy.js";
import { estimateTokens } from "../context/tokens.js";
import { ChatTimeoutError } from "../domain/errors.js";
import type { ConversationStore, MemoryStore } from "../domain/types.js";
import {
  HISTORY_LIMIT,
  renderHistoryPrompt,
  renderSummaryPrompt,
  selectHistoryWindow,
} from "./history-prompt.js";
import { scheduleLearning } from "./learning-reflector.js";
import { renderMemoryPrompt } from "./memory-prompt.js";

export type RunChatInput = {
  message: string;
  strategy?: string;
  reflect?: boolean;
  registry?: ChannelRegistry;
  critic?: Critic;
  timeoutMs?: number;
  conversationId?: string;
  conversationStore: ConversationStore;
  userId?: string;
  memoryStore: MemoryStore;
  learningExtractor?: LearningExtractor;
  conversationSummarizer?: ConversationSummarizer;
};

export type ContextBreakdown = {
  history: number;
  memory: number;
  summary: number;
};

export type ChatResult = Omit<StrategyResult, "metrics"> & {
  metrics: StrategyResult["metrics"] & {
    historyMessages: number;
    contextBreakdown: ContextBreakdown;
  };
  conversationId?: string;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_MAX_REFLECTIONS = 2;
const EGRESS_BATCH_SIZE = 8;

export async function runChat(input: RunChatInput): Promise<ChatResult> {
  const strategyName = input.strategy === undefined ? "react" : input.strategy;
  const reflect = input.reflect === true;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const strategy = resolveChannelStrategy({
    strategy: strategyName,
    reflect,
    registry: input.registry,
    critic: input.critic,
  });

  const prior = input.conversationId
    ? input.conversationStore.lastMessages(input.conversationId, HISTORY_LIMIT)
    : [];

  if (isBlankInput(input.message)) {
    const empty = buildEmptyInputResult();
    return {
      ...empty,
      metrics: {
        ...empty.metrics,
        historyMessages: 0,
        promptTokens: 0,
        contextBreakdown: { history: 0, memory: 0, summary: 0 },
      },
      ...(input.conversationId !== undefined
        ? { conversationId: input.conversationId }
        : {}),
    };
  }

  const window = selectHistoryWindow(prior, input.message);
  const history = renderHistoryPrompt(window);

  let memoryBlock = "";
  if (input.userId !== undefined) {
    const recalled = await input.memoryStore.recall(input.userId, input.message);
    memoryBlock = renderMemoryPrompt(recalled);
  }

  let summaryBlock = "";
  if (input.conversationId !== undefined) {
    const existing = input.conversationStore.getSummary(input.conversationId);
    if (existing !== null) {
      summaryBlock = renderSummaryPrompt(existing.text);
    }
  }

  const parts = [memoryBlock, summaryBlock, history].filter(
    (part) => part.length > 0,
  );
  const prompt = parts.join("\n\n");

  const runPromise = strategy.run(prompt, {
    maxIterations: DEFAULT_MAX_ITERATIONS,
    maxReflections: DEFAULT_MAX_REFLECTIONS,
    userId: input.userId,
    memoryStore: input.memoryStore,
  });

  // Avoid unhandled rejection if the timer wins and the strategy settles later.
  void runPromise.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      runPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ChatTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
    const conversationId =
      input.conversationId ?? input.conversationStore.create();
    input.conversationStore.append(conversationId, {
      role: "user",
      content: input.message,
    });
    input.conversationStore.append(conversationId, {
      role: "assistant",
      content: result.answer,
    });

    const summarizeEvents: TraceEvent[] = [];
    const existingSummary =
      input.conversationStore.getSummary(conversationId);
    const covered = existingSummary?.coveredThroughId ?? 0;
    const pending = input.conversationStore.listUnsummarizedOutsideWindow(
      conversationId,
      HISTORY_LIMIT,
      covered,
    );

    if (pending.length >= EGRESS_BATCH_SIZE) {
      const batch = pending.slice(0, EGRESS_BATCH_SIZE);
      const summarizer =
        input.conversationSummarizer ?? createLlmConversationSummarizer();
      try {
        const newText = (
          await summarizer.summarize({
            previousSummary: existingSummary?.text ?? "",
            egressBatch: batch.map(({ role, content }) => ({ role, content })),
          })
        ).trim();
        if (newText.length > 0) {
          const lastId = batch[EGRESS_BATCH_SIZE - 1]!.id;
          input.conversationStore.upsertSummary(
            conversationId,
            newText,
            lastId,
          );
          summarizeEvents.push({ type: "summarize", content: newText });
        }
      } catch (error: unknown) {
        console.error("[history-summarizer]", error);
      }
    }

    if (input.userId !== undefined) {
      scheduleLearning({
        userId: input.userId,
        userMessage: input.message,
        memoryStore: input.memoryStore,
        extractor: input.learningExtractor ?? createLlmLearningExtractor(),
      });
    }

    return {
      ...result,
      trace: [...result.trace, ...summarizeEvents],
      conversationId,
      metrics: {
        ...result.metrics,
        historyMessages: window.length,
        contextBreakdown: {
          history: estimateTokens(history),
          memory: estimateTokens(memoryBlock),
          summary: estimateTokens(summaryBlock),
        },
      },
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
