import { tool } from "@langchain/core/tools";
import { createReactAgent, ToolNode } from "@langchain/langgraph/prebuilt";

import { ModelUnavailableError } from "../domain/errors.js";
import {
  HumanApprovalRequiredError,
  describePendingApproval,
  findApprovalError,
  requiresHumanApproval,
} from "./approval-gate.js";
import {
  buildEmptyInputResult,
  isBlankInput,
  runWithMetrics,
  type ReasoningStrategy,
  type StrategyOptions,
  type ToolName,
} from "./strategy.js";
import {
  buildFallbackEvent,
  createCountingModel,
  resolveReportedModelUsed,
} from "./model.js";
import { createDefaultOpsStore } from "./store.js";
import { createOpsTools } from "./tools.js";
import {
  countAiMessages,
  ensureAnswerEvent,
  lastAnswer,
  messagesToTrace,
} from "./trace.js";

function wrapToolsWithApprovalGate(
  tools: ReturnType<typeof createOpsTools>["tools"],
): ReturnType<typeof createOpsTools>["tools"] {
  return tools.map((item) => {
    if (!requiresHumanApproval(item.name)) {
      return item;
    }
    const schema = item.schema;
    return tool(
      async (args: Record<string, unknown>) => {
        throw new HumanApprovalRequiredError({
          tool: item.name as ToolName,
          args,
        });
      },
      {
        name: item.name,
        description: item.description,
        schema,
      },
    );
  }) as ReturnType<typeof createOpsTools>["tools"];
}

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
      const { tools: rawTools } = createOpsTools(store, {
        userId: options.userId,
        memoryStore: options.memoryStore,
      });
      const tools = wrapToolsWithApprovalGate(rawTools);

      try {
        // Default ToolNode swallows tool errors as ToolMessage → LLM invents
        // "preciso de aprovação" em texto (200). Re-throw so we return 202.
        const agent = createReactAgent({
          llm: model,
          tools: new ToolNode(tools, { handleToolErrors: false }),
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
            modelUsed: resolveReportedModelUsed(
              getModelUsed(),
              model.getPrimaryModelId(),
            ),
          },
        };
      } catch (error: unknown) {
        const approval = findApprovalError(error);
        if (approval) {
          const actionTrace = [
            ...approval.trace,
            {
              type: "action" as const,
              tool: approval.tool,
              args: approval.args,
              node: "react" as const,
            },
          ];
          return {
            answer: "Aguardando aprovação humana.",
            trace: actionTrace,
            pendingApproval: {
              tool: approval.tool,
              args: approval.args,
              description: describePendingApproval(
                approval.tool,
                approval.args,
              ),
            },
            metrics: {
              llmCalls: getLlmCalls(),
              promptTokens: getPromptTokens(),
              modelUsed: resolveReportedModelUsed(
                getModelUsed(),
                model.getPrimaryModelId(),
              ),
            },
          };
        }
        if (error instanceof ModelUnavailableError) {
          throw error;
        }
        throw new ModelUnavailableError();
      }
    });
  },
};
