import { channelStrategies, type ChannelRegistry } from "../agents/index.js";
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
  createLlmRouter,
  runProductionGraph,
  type ProductionRouter,
} from "../agents/production-graph.js";
import { isProductionRoute } from "../agents/production-route.js";
import {
  buildEmptyInputResult,
  isBlankInput,
  type StrategyResult,
  type TraceEvent,
} from "../agents/strategy.js";
import { resolveContextBudgets } from "../context/context-builder.js";
import { estimateTokens } from "../context/tokens.js";
import { ChatTimeoutError, UnknownStrategyError } from "../domain/errors.js";
import type { ConversationStore, MemoryStore } from "../domain/types.js";
import {
  HISTORY_LIMIT,
  renderHistoryPrompt,
  selectHistoryWindow,
} from "./history-prompt.js";
import { scheduleLearning } from "./learning-reflector.js";

export type RunChatInput = {
  message: string;
  strategy?: string;
  reflect?: boolean;
  registry?: ChannelRegistry;
  critic?: Critic;
  router?: ProductionRouter;
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
  const reflect = input.reflect === true;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const registry = input.registry ?? channelStrategies;
  const router = input.router ?? createLlmRouter();

  if (isBlankInput(input.message)) {
    if (input.conversationId !== undefined) {
      input.conversationStore.lastMessages(input.conversationId, HISTORY_LIMIT);
    }
    const empty = buildEmptyInputResult();
    return {
      ...empty,
      trace: empty.trace.map((event) => ({ ...event, node: "response" as const })),
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

  if (input.strategy !== undefined && !isProductionRoute(input.strategy)) {
    throw new UnknownStrategyError(
      `Estratégia desconhecida: ${input.strategy}.`,
    );
  }

  const prior = input.conversationId
    ? input.conversationStore.lastMessages(input.conversationId, HISTORY_LIMIT)
    : [];

  const window = selectHistoryWindow(prior, input.message);
  const priorInWindow = window.slice(0, -1);

  const recalled =
    input.userId !== undefined
      ? await input.memoryStore.recall(input.userId, input.message)
      : [];

  let summaryText = "";
  if (input.conversationId !== undefined) {
    const existing = input.conversationStore.getSummary(input.conversationId);
    if (existing !== null) {
      summaryText = existing.text;
    }
  }

  const budgets = resolveContextBudgets(process.env);
  const sections = {
    system: "",
    message: input.message,
    summary: summaryText,
    window: priorInWindow,
    memory: recalled.map((item) => ({ fact: item.fact, score: item.score })),
  };

  const runPromise = runProductionGraph({
    message: input.message,
    sections,
    budgets,
    override:
      input.strategy !== undefined && isProductionRoute(input.strategy)
        ? input.strategy
        : undefined,
    reflect,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    maxReflections: DEFAULT_MAX_REFLECTIONS,
    userId: input.userId,
    memoryStore: input.memoryStore,
    registry,
    critic: input.critic,
    router,
  });

  // Avoid unhandled rejection if the timer wins and the graph settles later.
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
          summarizeEvents.push({
            type: "summarize",
            content: newText,
            node: "response",
          });
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

    const currentLine = renderHistoryPrompt([
      { role: "user", content: input.message },
    ]);
    const historyForBreakdown =
      result.built.sections.window.length > 0
        ? `${result.built.sections.window}\n${currentLine}`
        : currentLine;

    return {
      answer: result.answer,
      trace: [...result.trace, ...summarizeEvents],
      conversationId,
      metrics: {
        llmCalls: result.metrics.llmCalls,
        latencyMs: result.metrics.latencyMs,
        promptTokens: result.metrics.promptTokens,
        historyMessages: window.length,
        contextBreakdown: {
          history: estimateTokens(historyForBreakdown),
          memory: estimateTokens(result.built.sections.memory),
          summary: estimateTokens(result.built.sections.summary),
        },
      },
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
