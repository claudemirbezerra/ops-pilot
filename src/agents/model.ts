import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";

import { readPromptTokens } from "../context/tokens.js";
import { MissingModelConfigError } from "../domain/errors.js";
import { buildLimitReachedAnswer } from "./strategy.js";

export type ModelEnv = {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
};

/** Evita hang eterno quando OpenRouter/TLS não responde (default do SDK: timeout undefined). */
export const MODEL_REQUEST_TIMEOUT_MS = 60_000;
export const MODEL_MAX_RETRIES = 2;

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

export function createModel(env: ModelEnv = process.env): ChatOpenAI {
  const { apiKey, model } = readModelConfig(env);
  return new ChatOpenAI(openRouterFields(apiKey, model));
}

export type LimitedModel = {
  model: ChatOpenAI;
  getLlmCalls: () => number;
  getPromptTokens: () => number;
};

/** ChatOpenAI that counts real invokes and stops after maxIterations. */
export function createCountingModel(
  maxIterations: number,
  env: ModelEnv = process.env,
): LimitedModel {
  const { apiKey, model } = readModelConfig(env);
  let llmCalls = 0;
  let promptTokens = 0;
  const limitMessage = buildLimitReachedAnswer(maxIterations);

  class CountingChatOpenAI extends ChatOpenAI {
    override async invoke(
      input: Parameters<ChatOpenAI["invoke"]>[0],
      options?: Parameters<ChatOpenAI["invoke"]>[1],
    ): Promise<Awaited<ReturnType<ChatOpenAI["invoke"]>>> {
      if (llmCalls >= maxIterations) {
        return new AIMessage(limitMessage) as Awaited<ReturnType<ChatOpenAI["invoke"]>>;
      }

      llmCalls += 1;
      const result = await super.invoke(input, options);
      promptTokens += readPromptTokens(result);
      return result;
    }
  }

  return {
    model: new CountingChatOpenAI(openRouterFields(apiKey, model)),
    getLlmCalls: () => llmCalls,
    getPromptTokens: () => promptTokens,
  };
}
