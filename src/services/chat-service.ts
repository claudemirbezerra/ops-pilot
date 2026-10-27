import {
  resolveChannelStrategy,
  type ChannelRegistry,
} from "../agents/index.js";
import type { Critic } from "../agents/critic.js";
import {
  createLlmLearningExtractor,
  type LearningExtractor,
} from "../agents/learning-extractor.js";
import {
  buildEmptyInputResult,
  isBlankInput,
  type StrategyResult,
} from "../agents/strategy.js";
import { ChatTimeoutError } from "../domain/errors.js";
import type { ConversationStore, MemoryStore } from "../domain/types.js";
import {
  HISTORY_LIMIT,
  renderHistoryPrompt,
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
};

export type ChatResult = Omit<StrategyResult, "metrics"> & {
  metrics: StrategyResult["metrics"] & { historyMessages: number };
  conversationId?: string;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_MAX_REFLECTIONS = 2;

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
      metrics: { ...empty.metrics, historyMessages: 0 },
      ...(input.conversationId !== undefined
        ? { conversationId: input.conversationId }
        : {}),
    };
  }

  const window = selectHistoryWindow(prior, input.message);
  const history = renderHistoryPrompt(window);

  let prompt = history;
  if (input.userId !== undefined) {
    const recalled = await input.memoryStore.recall(input.userId, input.message);
    const memoryBlock = renderMemoryPrompt(recalled);
    prompt = memoryBlock ? `${memoryBlock}\n\n${history}` : history;
  }

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
      conversationId,
      metrics: { ...result.metrics, historyMessages: window.length },
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
