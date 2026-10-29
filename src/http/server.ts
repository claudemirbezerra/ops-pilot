import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import {
  channelStrategies,
  type ChannelRegistry,
} from "../agents/index.js";
import type { Critic } from "../agents/critic.js";
import type { ConversationSummarizer } from "../agents/conversation-summarizer.js";
import type { LearningExtractor } from "../agents/learning-extractor.js";
import type { ProductionRouter } from "../agents/production-graph.js";
import type { ConversationStore, MemoryStore } from "../domain/types.js";
import { runChat } from "../services/chat-service.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import {
  ChatTimeoutError,
  ConversationNotFoundError,
  EmbeddingUnavailableError,
  InvalidRouteError,
  UnknownStrategyError,
} from "../domain/errors.js";

export const DEFAULT_CHAT_TIMEOUT_MS = 180_000;

const chatBodySchema = z.object({
  message: z.string(),
  strategy: z.string().optional(),
  reflect: z.boolean().optional(),
  conversationId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
});

export type CreateAppOptions = {
  registry?: ChannelRegistry;
  critic?: Critic;
  router?: ProductionRouter;
  timeoutMs?: number;
  conversationStore?: ConversationStore;
  memoryStore?: MemoryStore;
  learningExtractor?: LearningExtractor;
  conversationSummarizer?: ConversationSummarizer;
};

export function createApp(options: CreateAppOptions = {}): Express {
  const registry = options.registry ?? channelStrategies;
  const critic = options.critic;
  const router = options.router;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS;
  const conversationStore =
    options.conversationStore ?? new SqliteConversationStore();
  const memoryStore = options.memoryStore ?? new SqliteMemoryStore();
  const learningExtractor = options.learningExtractor;
  const conversationSummarizer = options.conversationSummarizer;

  const app = express();
  app.use(express.json());

  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      next: NextFunction,
    ): void => {
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        (error as { type?: string }).type === "entity.parse.failed"
      ) {
        res.status(400).json({
          issues: [{ path: [], message: "JSON inválido." }],
        });
        return;
      }
      next(error);
    },
  );

  app.post("/chat", async (req: Request, res: Response) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ issues: parsed.error.issues });
      return;
    }

    try {
      const result = await runChat({
        message: parsed.data.message,
        strategy: parsed.data.strategy,
        reflect: parsed.data.reflect,
        registry,
        critic,
        router,
        timeoutMs,
        conversationId: parsed.data.conversationId,
        conversationStore,
        userId: parsed.data.userId,
        memoryStore,
        learningExtractor,
        conversationSummarizer,
      });
      res.status(200).json({
        answer: result.answer,
        trace: result.trace,
        metrics: result.metrics,
        ...(result.conversationId !== undefined
          ? { conversationId: result.conversationId }
          : {}),
      });
    } catch (error: unknown) {
      if (error instanceof UnknownStrategyError) {
        res.status(422).json({ message: error.message });
        return;
      }
      if (error instanceof ConversationNotFoundError) {
        res.status(404).json({ message: error.message });
        return;
      }
      if (error instanceof InvalidRouteError) {
        res.status(502).json({ message: error.message });
        return;
      }
      if (error instanceof ChatTimeoutError) {
        res.status(504).json({ message: error.message });
        return;
      }
      if (error instanceof EmbeddingUnavailableError) {
        res.status(503).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  return app;
}
