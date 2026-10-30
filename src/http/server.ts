import { randomUUID } from "node:crypto";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  Router,
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
import type {
  ApprovalStore,
  ConversationStore,
  MemoryStore,
  OpsStore,
  RequestStore,
} from "../domain/types.js";
import { runChat } from "../services/chat-service.js";
import { resolveApproval } from "../services/approval-service.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { SqliteRequestStore } from "../store/sqlite-request-store.js";
import { InMemoryApprovalStore } from "../store/in-memory-approval-store.js";
import { createLogger, type ObsLogger } from "../obs/logger.js";
import {
  ApprovalAlreadyResolvedError,
  ApprovalNotFoundError,
  ChatTimeoutError,
  ConversationNotFoundError,
  EmbeddingUnavailableError,
  InvalidRouteError,
  ModelUnavailableError,
  RequestNotFoundError,
  UnknownStrategyError,
} from "../domain/errors.js";
import { persistChatRequest } from "./persist-chat-request.js";
import { createCorsMiddleware } from "./cors.js";

export const DEFAULT_CHAT_TIMEOUT_MS = 180_000;

const chatBodySchema = z.object({
  message: z.string(),
  strategy: z.string().optional(),
  reflect: z.boolean().optional(),
  conversationId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
});

const approvalBodySchema = z.object({
  decision: z.enum(["approve", "deny"]),
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
  requestStore?: RequestStore;
  approvalStore?: ApprovalStore;
  opsStore?: OpsStore;
  logger?: ObsLogger;
  /** Override CORS allowlist env for tests */
  corsOriginsEnv?: string;
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
  const requestStore = options.requestStore ?? new SqliteRequestStore();
  const approvalStore = options.approvalStore ?? new InMemoryApprovalStore();
  const opsStore = options.opsStore;
  const logger = options.logger ?? createLogger();

  const app = express();
  app.use(express.json());
  app.use(
    createCorsMiddleware({
      originsEnv: options.corsOriginsEnv,
    }),
  );

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

  const opsRouter = Router();

  opsRouter.post("/chat", async (req: Request, res: Response) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ issues: parsed.error.issues });
      return;
    }

    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);

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

      persistChatRequest({
        requestId,
        metrics: result.metrics as unknown as Record<string, unknown>,
        trace: result.trace,
        requestStore,
        logger,
      });

      if (result.pendingApproval !== undefined) {
        const approvalId = randomUUID();
        approvalStore.save({
          id: approvalId,
          createdAt: Date.now(),
          status: "pending",
          tool: result.pendingApproval.tool,
          args: result.pendingApproval.args,
          description: result.pendingApproval.description,
          requestId,
          conversationId: result.conversationId,
          trace: result.trace,
          metrics: result.metrics as unknown as Record<string, unknown>,
        });

        res.status(202).json({
          requestId,
          approvalId,
          pending: {
            tool: result.pendingApproval.tool,
            args: result.pendingApproval.args,
            description: result.pendingApproval.description,
          },
          trace: result.trace,
          metrics: result.metrics,
          ...(result.conversationId !== undefined
            ? { conversationId: result.conversationId }
            : {}),
        });
        return;
      }

      res.status(200).json({
        requestId,
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
      if (error instanceof ModelUnavailableError) {
        res.status(503).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  opsRouter.get("/request/:id", (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (id.length === 0) {
      res.status(400).json({
        issues: [{ path: ["id"], message: "id é obrigatório." }],
      });
      return;
    }

    const saved = requestStore.getById(id);
    if (saved === null) {
      const error = new RequestNotFoundError();
      res.status(404).json({ message: error.message });
      return;
    }

    res.status(200).json({
      requestId: saved.requestId,
      createdAt: saved.createdAt,
      metrics: saved.metrics,
      trace: saved.trace,
    });
  });

  opsRouter.post("/approvals/:id", async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (id.length === 0) {
      res.status(400).json({
        issues: [{ path: ["id"], message: "id é obrigatório." }],
      });
      return;
    }

    const parsed = approvalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ issues: parsed.error.issues });
      return;
    }

    try {
      const result = await resolveApproval({
        approvalId: id,
        decision: parsed.data.decision,
        approvalStore,
        opsStore,
      });
      res.setHeader("X-Request-Id", result.requestId);
      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof ApprovalNotFoundError) {
        res.status(404).json({ message: error.message });
        return;
      }
      if (error instanceof ApprovalAlreadyResolvedError) {
        res.status(409).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  app.use(opsRouter);
  app.use("/opspilot", opsRouter);

  return app;
}
