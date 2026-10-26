import { createReactAgent } from "@langchain/langgraph/prebuilt";

import {
  MODEL_UNAVAILABLE_ANSWER,
  buildEmptyInputResult,
  isBlankInput,
  runWithMetrics,
  type ReasoningStrategy,
  type StrategyOptions,
} from "./strategy.js";
import { createCountingModel } from "./model.js";
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
      const { model, getLlmCalls } = createCountingModel(options.maxIterations);
      const store = options.opsStore ?? createDefaultOpsStore();
      const { tools } = createOpsTools(store);

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
        const trace = ensureAnswerEvent(messagesToTrace(messages), answer);

        return {
          answer,
          trace,
          metrics: {
            llmCalls: getLlmCalls() || countAiMessages(messages),
          },
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : MODEL_UNAVAILABLE_ANSWER;
        const answer = `${MODEL_UNAVAILABLE_ANSWER} (${message})`;
        return {
          answer,
          trace: [{ type: "answer" as const, content: answer }],
          metrics: { llmCalls: getLlmCalls() },
        };
      }
    });
  },
};
