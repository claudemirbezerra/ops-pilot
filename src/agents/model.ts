import { AIMessage } from "@langchain/core/messages";
import {
  Runnable,
  RunnableLambda,
  type RunnableInterface,
} from "@langchain/core/runnables";
import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";

import { readPromptTokens } from "../context/tokens.js";
import {
  MissingModelConfigError,
  ModelUnavailableError,
} from "../domain/errors.js";
import {
  buildLimitReachedAnswer,
  type TraceEvent,
  type TraceNode,
} from "./strategy.js";

export type ModelEnv = {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_MODEL_FALLBACK?: string;
};

/** Evita hang eterno quando OpenRouter/TLS não responde (default do SDK: timeout undefined). */
export const MODEL_REQUEST_TIMEOUT_MS = 60_000;
/** Retries do SDK desligados; tentativas vêm de `withRetry({ stopAfterAttempt })`. */
export const MODEL_MAX_RETRIES = 0;
/** Tentativas no principal (e no reserva), alinhado ao sketch `stopAfterAttempt: 2`. */
export const MODEL_RETRY_STOP_AFTER_ATTEMPT = 2;

type MutableSession = {
  primaryId: string;
  fallbackId: string | undefined;
  modelUsed: string | undefined;
  fallbackOccurred: boolean;
};

export type SessionedModel = ChatOpenAI & {
  getModelUsed: () => string | undefined;
  didFallback: () => boolean;
  getPrimaryModelId: () => string;
  getFallbackModelId: () => string | undefined;
};

export function resolveFallbackModel(env: ModelEnv): string | undefined {
  const raw = env.OPENROUTER_MODEL_FALLBACK;
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildFallbackEvent(args: {
  from: string;
  to: string;
  node?: TraceNode;
}): Extract<TraceEvent, { type: "fallback" }> {
  return {
    type: "fallback",
    from: args.from,
    to: args.to,
    ...(args.node !== undefined ? { node: args.node } : {}),
  };
}

function readModelConfig(env: ModelEnv): { apiKey: string; model: string } {
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  const model = env.OPENROUTER_MODEL?.trim() ?? "";

  if (!apiKey || !model) {
    throw new MissingModelConfigError(
      "Defina OPENROUTER_API_KEY e OPENROUTER_MODEL no ambiente do processo.",
    );
  }

  return { apiKey, model };
}

function openRouterFields(apiKey: string, model: string): ChatOpenAIFields {
  return {
    model,
    temperature: 0,
    apiKey,
    timeout: MODEL_REQUEST_TIMEOUT_MS,
    maxRetries: MODEL_MAX_RETRIES,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  };
}

function newSession(
  primaryId: string,
  fallbackId: string | undefined,
): MutableSession {
  return {
    primaryId,
    fallbackId,
    modelUsed: undefined,
    fallbackOccurred: false,
  };
}

function attachSession(
  model: ChatOpenAI,
  session: MutableSession,
): SessionedModel {
  const sessioned = model as SessionedModel;
  sessioned.getModelUsed = () => session.modelUsed;
  sessioned.didFallback = () => session.fallbackOccurred;
  sessioned.getPrimaryModelId = () => session.primaryId;
  sessioned.getFallbackModelId = () => session.fallbackId;
  return sessioned;
}

/**
 * Composição testável: `primary.withRetry` + opcional `withFallbacks([reserve.withRetry])`.
 * API LangChain: `withFallbacks` (plural), não `withFallback`.
 */
export function composeResilientModel(args: {
  primary: RunnableInterface;
  reserve?: RunnableInterface;
  stopAfterAttempt?: number;
}): Runnable {
  const stopAfterAttempt =
    args.stopAfterAttempt ?? MODEL_RETRY_STOP_AFTER_ATTEMPT;
  const primary = (args.primary as Runnable).withRetry({ stopAfterAttempt });
  if (args.reserve === undefined) {
    return primary;
  }
  const reserve = (args.reserve as Runnable).withRetry({ stopAfterAttempt });
  return primary.withFallbacks([reserve]);
}

async function invokeOrUnavailable<T>(
  chain: RunnableInterface,
  input: unknown,
  options?: unknown,
): Promise<T> {
  try {
    return (await chain.invoke(input, options as never)) as T;
  } catch (error: unknown) {
    if (error instanceof ModelUnavailableError) {
      throw error;
    }
    throw new ModelUnavailableError();
  }
}

type ObserveHooks = {
  /** Se retornar mensagem, não chama o provedor (ex.: teto de iterações). */
  beforeInvoke?: () => AIMessage | undefined;
  afterSuccess?: (result: unknown) => void;
};

function baseModel(
  apiKey: string,
  modelId: string,
  session: MutableSession,
  isReserve: boolean,
  hooks: ObserveHooks = {},
): ChatOpenAI {
  class ObservedChatOpenAI extends ChatOpenAI {
    override async invoke(
      input: Parameters<ChatOpenAI["invoke"]>[0],
      options?: Parameters<ChatOpenAI["invoke"]>[1],
    ): Promise<Awaited<ReturnType<ChatOpenAI["invoke"]>>> {
      const early = hooks.beforeInvoke?.();
      if (early !== undefined) {
        return early as Awaited<ReturnType<ChatOpenAI["invoke"]>>;
      }
      const result = await super.invoke(input, options);
      session.modelUsed = modelId;
      if (isReserve) {
        session.fallbackOccurred = true;
      }
      hooks.afterSuccess?.(result);
      return result;
    }
  }

  return new ObservedChatOpenAI(openRouterFields(apiKey, modelId));
}

function buildResilientChat(
  apiKey: string,
  primaryId: string,
  fallbackId: string | undefined,
  session: MutableSession,
  hooks: ObserveHooks = {},
): SessionedModel {
  const primary = baseModel(apiKey, primaryId, session, false, hooks);
  const backup =
    fallbackId !== undefined
      ? baseModel(apiKey, fallbackId, session, true, hooks)
      : undefined;

  // Sketch: primary.withRetry(...); backup?.withRetry(...); primary.withFallbacks([backup])
  const chain = composeResilientModel({
    primary,
    ...(backup !== undefined ? { reserve: backup } : {}),
  });

  class ResilientChatOpenAI extends ChatOpenAI {
    override async invoke(
      input: Parameters<ChatOpenAI["invoke"]>[0],
      options?: Parameters<ChatOpenAI["invoke"]>[1],
    ): Promise<Awaited<ReturnType<ChatOpenAI["invoke"]>>> {
      return invokeOrUnavailable(chain, input, options);
    }
  }

  return attachSession(
    new ResilientChatOpenAI(openRouterFields(apiKey, primaryId)),
    session,
  );
}

/**
 * Fábrica de produção — sketch:
 * `primary.withRetry(...).withFallbacks([backup.withRetry(...)])` quando houver reserva.
 */
export function createModel(env: ModelEnv = process.env): SessionedModel {
  const { apiKey, model: primaryId } = readModelConfig(env);
  const fallbackId = resolveFallbackModel(env);
  const session = newSession(primaryId, fallbackId);
  return buildResilientChat(apiKey, primaryId, fallbackId, session);
}

export type LimitedModel = {
  model: SessionedModel;
  getLlmCalls: () => number;
  getPromptTokens: () => number;
  getModelUsed: () => string | undefined;
  didFallback: () => boolean;
};

/** ChatOpenAI that counts real invokes and stops after maxIterations. */
export function createCountingModel(
  maxIterations: number,
  env: ModelEnv = process.env,
): LimitedModel {
  const { apiKey, model: primaryId } = readModelConfig(env);
  const fallbackId = resolveFallbackModel(env);
  const session = newSession(primaryId, fallbackId);
  let llmCalls = 0;
  let promptTokens = 0;
  const limitMessage = buildLimitReachedAnswer(maxIterations);

  const model = buildResilientChat(apiKey, primaryId, fallbackId, session, {
    beforeInvoke: () => {
      if (llmCalls >= maxIterations) {
        return new AIMessage(limitMessage);
      }
      llmCalls += 1;
      return undefined;
    },
    afterSuccess: (result) => {
      promptTokens += readPromptTokens(result);
    },
  });

  return {
    model,
    getLlmCalls: () => llmCalls,
    getPromptTokens: () => promptTokens,
    getModelUsed: () => session.modelUsed,
    didFallback: () => session.fallbackOccurred,
  };
}

/** Helper de teste: RunnableLambda que falha N vezes e depois resolve. */
export function flakyRunnable(args: {
  failuresBeforeSuccess: number;
  value?: string;
  onCall?: () => void;
}): Runnable {
  let calls = 0;
  return RunnableLambda.from(async (input: unknown) => {
    args.onCall?.();
    calls += 1;
    if (calls <= args.failuresBeforeSuccess) {
      throw new Error(`flaky failure #${calls}`);
    }
    return args.value ?? input;
  });
}
