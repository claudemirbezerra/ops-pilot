import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { createModel } from "./model.js";
import {
  MODEL_UNAVAILABLE_ANSWER,
  buildEmptyInputResult,
  buildLimitReachedAnswer,
  isBlankInput,
  runWithMetrics,
  type ReasoningStrategy,
  type StrategyOptions,
  type TraceEvent,
  type ToolName,
} from "./strategy.js";
import { createOpsTools } from "./tools.js";
import { ensureAnswerEvent } from "./trace.js";

const planSchema = z.object({
  steps: z.array(z.string().min(1)).min(1).max(8),
});

const replanSchema = z.object({
  critique: z.string().min(1),
  done: z.boolean(),
  steps: z.array(z.string().min(1)).max(8).default([]),
  answer: z.string().optional(),
});

const PlanState = Annotation.Root({
  input: Annotation<string>,
  steps: Annotation<string[]>,
  stepsTaken: Annotation<number>,
  maxIterations: Annotation<number>,
  answer: Annotation<string>,
  trace: Annotation<TraceEvent[]>,
  llmCalls: Annotation<number>,
  done: Annotation<boolean>,
});

type PlanStateType = typeof PlanState.State;

function messageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("")
      .trim();
  }
  return content == null ? "" : String(content);
}

function createPlanGraph() {
  const model = createModel();
  const { tools } = createOpsTools();
  const toolsByName = new Map<string, (typeof tools)[number]>(
    tools.map((item) => [item.name, item]),
  );

  const planner = async (state: PlanStateType): Promise<Partial<PlanStateType>> => {
    const structured = model.withStructuredOutput(planSchema);
    const plan = await structured.invoke([
      new SystemMessage(
        "Você é o planner do OpsPilot. Produza uma lista curta de passos (máximo 8) para resolver o pedido usando list_alertas, open_incident e resolver_incident.",
      ),
      new HumanMessage(state.input),
    ]);

    const steps = plan.steps.slice(0, 8);
    return {
      steps,
      llmCalls: state.llmCalls + 1,
      trace: [...state.trace, { type: "plan", steps }],
    };
  };

  const executor = async (state: PlanStateType): Promise<Partial<PlanStateType>> => {
    if (
      state.steps.length === 0 ||
      state.stepsTaken >= 8 ||
      state.stepsTaken >= state.maxIterations
    ) {
      return {
        done: true,
        answer: state.answer || buildLimitReachedAnswer(state.maxIterations),
      };
    }

    const step = state.steps[0]!;
    const remaining = state.steps.slice(1);
    const bound = model.bindTools(tools);
    const ai = await bound.invoke([
      new SystemMessage(
        "Execute exatamente um passo operacional do plantão. Use as ferramentas quando necessário e responda de forma objetiva.",
      ),
      new HumanMessage(`Pedido original: ${state.input}\nPasso atual: ${step}`),
    ]);

    const events: TraceEvent[] = [];
    const text = messageContent(ai.content);
    if (text.length > 0) {
      events.push({ type: "thought", content: text });
    }

    for (const call of ai.tool_calls ?? []) {
      const toolName = (["list_alertas", "open_incident", "resolver_incident"] as const).includes(
        call.name as ToolName,
      )
        ? (call.name as ToolName)
        : ("list_alertas" as ToolName);

      events.push({
        type: "action",
        tool: toolName,
        args: (call.args ?? {}) as Record<string, unknown>,
      });

      const selected = toolsByName.get(call.name);
      let observation: string;
      if (!selected) {
        observation = `Ferramenta desconhecida: ${call.name}`;
      } else {
        const invoke = selected.invoke.bind(selected) as (
          input: Record<string, unknown>,
        ) => Promise<unknown>;
        const raw = await invoke((call.args ?? {}) as Record<string, unknown>);
        observation = typeof raw === "string" ? raw : JSON.stringify(raw);
      }
      events.push({ type: "observation", content: observation });
      void new ToolMessage({
        content: observation,
        tool_call_id: call.id ?? call.name,
      });
    }

    return {
      steps: remaining,
      stepsTaken: state.stepsTaken + 1,
      llmCalls: state.llmCalls + 1,
      trace: [...state.trace, ...events],
    };
  };

  const replanner = async (state: PlanStateType): Promise<Partial<PlanStateType>> => {
    if (state.stepsTaken >= 8 || state.stepsTaken >= state.maxIterations) {
      const answer = buildLimitReachedAnswer(Math.min(8, state.maxIterations));
      return {
        done: true,
        answer,
        steps: [],
        trace: [...state.trace, { type: "critique", content: answer }],
      };
    }

    const structured = model.withStructuredOutput(replanSchema);
    const revision = await structured.invoke([
      new SystemMessage(
        "Revise o plano restante do OpsPilot. Se o pedido já foi atendido, done=true e preencha answer. Caso contrário, done=false e liste os passos restantes (máximo 8).",
      ),
      new HumanMessage(
        JSON.stringify({
          input: state.input,
          remainingSteps: state.steps,
          stepsTaken: state.stepsTaken,
          recentTrace: state.trace.slice(-6),
        }),
      ),
    ]);

    const critiqueEvent: TraceEvent = { type: "critique", content: revision.critique };

    const remainingSteps = revision.steps ?? [];

    if (revision.done || remainingSteps.length === 0) {
      const answer = revision.answer?.trim() || revision.critique || "Plano concluído.";
      return {
        done: true,
        steps: [],
        answer,
        llmCalls: state.llmCalls + 1,
        trace: [...state.trace, critiqueEvent],
      };
    }

    return {
      done: false,
      steps: remainingSteps.slice(0, 8),
      llmCalls: state.llmCalls + 1,
      trace: [...state.trace, critiqueEvent],
    };
  };

  const shouldContinue = (state: PlanStateType): "executor" | typeof END => {
    if (state.done || state.steps.length === 0) {
      return END;
    }
    if (state.stepsTaken >= 8 || state.stepsTaken >= state.maxIterations) {
      return END;
    }
    return "executor";
  };

  return new StateGraph(PlanState)
    .addNode("planner", planner)
    .addNode("executor", executor)
    .addNode("replanner", replanner)
    .addEdge(START, "planner")
    .addEdge("planner", "executor")
    .addEdge("executor", "replanner")
    .addConditionalEdges("replanner", shouldContinue, {
      executor: "executor",
      [END]: END,
    })
    .compile();
}

export const planAndExecuteStrategy: ReasoningStrategy = {
  name: "plan-and-execute",

  async run(input: string, options: StrategyOptions) {
    if (isBlankInput(input)) {
      return buildEmptyInputResult();
    }

    return runWithMetrics(async () => {
      try {
        const graph = createPlanGraph();
        const finalState = await graph.invoke({
          input,
          steps: [],
          stepsTaken: 0,
          maxIterations: options.maxIterations,
          answer: "",
          trace: [],
          llmCalls: 0,
          done: false,
        });

        let answer = finalState.answer?.trim() ?? "";
        if (!answer) {
          answer =
            finalState.stepsTaken >= options.maxIterations || finalState.stepsTaken >= 8
              ? buildLimitReachedAnswer(Math.min(8, options.maxIterations))
              : "Plano concluído sem resposta explícita.";
        }

        return {
          answer,
          trace: ensureAnswerEvent(finalState.trace, answer),
          metrics: { llmCalls: finalState.llmCalls },
        };
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : "erro desconhecido";
        const answer = `${MODEL_UNAVAILABLE_ANSWER} (${detail})`;
        return {
          answer,
          trace: [{ type: "answer" as const, content: answer }],
          metrics: { llmCalls: 0 },
        };
      }
    });
  },
};
