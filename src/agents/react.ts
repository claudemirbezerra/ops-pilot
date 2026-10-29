import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { ModelUnavailableError } from "../domain/errors.js";
import {
  buildEmptyInputResult,
  isBlankInput,
  runWithMetrics,
  type ReasoningStrategy,
  type StrategyOptions,
} from "./strategy.js";
import { buildFallbackEvent, createCountingModel } from "./model.js";
import { createDefaultOpsStore } from "./store.js";
import { createOpsTools } from "./tools.js";
import {
  countAiMessages,
  ensureAnswerEvent,
  lastAnswer,
  messagesToTrace,
} from "./trace.js";

export const reactStrategy: ReasoningStrategy = {
  name: "react",

  async run(input: string, options: StrategyOptions) {
    if (isBlankInput(input)) {
      return buildEmptyInputResult();
    }

    return runWithMetrics(async () => {
      const {
        model,
        getLlmCalls,
        getPromptTokens,
        getModelUsed,
        didFallback,
      } = createCountingModel(options.maxIterations);
      const store = options.opsStore ?? createDefaultOpsStore();
      const { tools } = createOpsTools(store, {
        userId: options.userId,
        memoryStore: options.memoryStore,
      });

      try {
        const agent = createReactAgent({
          llm: model,
          tools,
        });

        const result = await agent.invoke(
          { messages: [{ role: "user", content: input }] },
          { recursionLimit: Math.max(options.maxIterations * 2, 4) },
        );

        const messages = result.messages ?? [];
        const answer = lastAnswer(messages, "");
        let trace = ensureAnswerEvent(messagesToTrace(messages), answer);
        if (didFallback()) {
          const from = model.getPrimaryModelId();
          const to = model.getFallbackModelId();
          if (to !== undefined) {
            trace = [
              buildFallbackEvent({ from, to, node: "react" }),
              ...trace,
            ];
          }
        }

        return {
          answer,
          trace,
          metrics: {
            llmCalls: getLlmCalls() || countAiMessages(messages),
            promptTokens: getPromptTokens(),
            ...(getModelUsed() !== undefined
              ? { modelUsed: getModelUsed() }
              : {}),
          },
        };
      } catch (error: unknown) {
        if (error instanceof ModelUnavailableError) {
          throw error;
        }
        throw new ModelUnavailableError();
      }
    });
  },
};
