import { HumanMessage, SystemMessage } from "@langchain/core/messages";
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
  type ToolName,
  type TraceEvent,
} from "./strategy.js";
import { createDefaultOpsStore, type OpsStore } from "./store.js";
import { createOpsTools } from "./tools.js";
import { ensureAnswerEvent } from "./trace.js";

const MAX_STEPS = 8;

const PLANNER_PROMPT = `Você é o planner do OpsPilot.
Produza passos curtos, ordenados e executáveis com as ferramentas list_alertas, open_incident, resolver_incident, list_incidents e consultar_runbook.
No máximo ${MAX_STEPS} passos.`;

const EXECUTOR_PROMPT = `Você é o executor do OpsPilot.
Execute exatamente o passo indicado usando as ferramentas disponíveis quando necessário.
Responda com o resultado objetivo do passo.`;

const REPLANNER_PROMPT = `Você é o replanner do OpsPilot.
Com base no pedido original, no plano restante e no histórico de passos já feitos (done),
decida:
- "seguir": continuar com o plano restante (ou informe steps atualizados se quiser podar)
- "ajustar": substituir o plano restante por novos steps
- "encerrar": pedido atendido; preencha answer
Máximo de ${MAX_STEPS} passos no total (incluindo os já feitos).`;

const planSchema = z.object({
  steps: z
    .array(z.string())
    .describe("passos curtos, ordenados, executáveis com as ferramentas disponíveis"),
});

const replanSchema = z.object({
  decision: z.enum(["ajustar", "seguir", "encerrar"]),
  critique: z.string().describe("Breve revisão do que já foi feito e do que falta"),
  steps: z
    .array(z.string())
    .max(MAX_STEPS)
    .optional()
    .describe("Novo plano restante quando decision for ajustar (ou podar em seguir)"),
  answer: z.string().optional().describe("Resposta final quando decision for encerrar"),
});

/** Estado no formato do exemplo: plan + done (passos concluídos) + answer. */
const PEState = Annotation.Root({
  input: Annotation<string>,
  plan: Annotation<string[]>,
  done: Annotation<[string, string][]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  answer: Annotation<string>,
  maxIterations: Annotation<number>,
  trace: Annotation<TraceEvent[]>,
  llmCalls: Annotation<number>,
});

type PEStateType = typeof PEState.State;

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

function asToolName(name: string): ToolName {
  if (
    name === "list_alertas" ||
    name === "open_incident" ||
    name === "resolver_incident" ||
    name === "list_incidents" ||
    name === "consultar_runbook"
  ) {
    return name;
  }
  return "list_alertas";
}

function createPlanExecuteGraph(
  store: OpsStore,
  options: { noReplanner?: boolean } = {},
) {
  const model = createModel();
  const { tools } = createOpsTools(store);
  const toolsByName = new Map<string, (typeof tools)[number]>(
    tools.map((item) => [item.name, item]),
  );
  const noReplanner = options.noReplanner === true;

  async function planner(state: PEStateType): Promise<Partial<PEStateType>> {
    const plan = await model.withStructuredOutput(planSchema).invoke([
      ["system", PLANNER_PROMPT],
      ["user", state.input],
    ]);

    const steps = plan.steps.filter((step) => step.trim().length > 0).slice(0, MAX_STEPS);
    return {
      plan: steps,
      llmCalls: state.llmCalls + 1,
      trace: [...state.trace, { type: "plan", steps }],
    };
  }

  async function executor(state: PEStateType): Promise<Partial<PEStateType>> {
    if (state.plan.length === 0 || state.done.length >= MAX_STEPS) {
      return {};
    }

    const step = state.plan[0]!;
    const remaining = state.plan.slice(1);
    const bound = model.bindTools(tools);

    const ai = await bound.invoke([
      new SystemMessage(EXECUTOR_PROMPT),
      new HumanMessage(
        JSON.stringify({
          input: state.input,
          step,
          done: state.done,
        }),
      ),
    ]);

    const events: TraceEvent[] = [];
    const thought = messageContent(ai.content);
    if (thought.length > 0) {
      events.push({ type: "thought", content: thought });
    }

    const observations: string[] = [];
    for (const call of ai.tool_calls ?? []) {
      const toolName = asToolName(call.name);
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
      observations.push(observation);
      events.push({ type: "observation", content: observation });
    }

    const resultText =
      observations.length > 0
        ? observations.join("\n")
        : thought || `Passo executado sem ferramenta: ${step}`;

    return {
      plan: remaining,
      done: [[step, resultText]],
      llmCalls: state.llmCalls + 1,
      trace: [...state.trace, ...events],
    };
  }

  async function replanner(state: PEStateType): Promise<Partial<PEStateType>> {
    if (state.done.length >= MAX_STEPS || state.done.length >= state.maxIterations) {
      const answer = buildLimitReachedAnswer(Math.min(MAX_STEPS, state.maxIterations));
      return {
        plan: [],
        answer,
        trace: [...state.trace, { type: "critique", content: answer }],
      };
    }

    const revision = await model.withStructuredOutput(replanSchema).invoke([
      ["system", REPLANNER_PROMPT],
      [
        "user",
        JSON.stringify({
          input: state.input,
          remainingPlan: state.plan,
          done: state.done,
          stepsTaken: state.done.length,
          maxSteps: MAX_STEPS,
        }),
      ],
    ]);

    const critique: TraceEvent = { type: "critique", content: revision.critique };

    if (revision.decision === "encerrar") {
      const answer =
        revision.answer?.trim() ||
        revision.critique ||
        "Pedido atendido.";
      return {
        plan: [],
        answer,
        llmCalls: state.llmCalls + 1,
        trace: [...state.trace, critique],
      };
    }

    if (revision.decision === "ajustar") {
      const steps = (revision.steps ?? [])
        .filter((step) => step.trim().length > 0)
        .slice(0, Math.max(0, MAX_STEPS - state.done.length));
      return {
        plan: steps,
        llmCalls: state.llmCalls + 1,
        trace: [...state.trace, critique],
      };
    }

    // seguir: mantém o plano restante, opcionalmente podado
    const steps =
      revision.steps && revision.steps.length > 0
        ? revision.steps
            .filter((step) => step.trim().length > 0)
            .slice(0, Math.max(0, MAX_STEPS - state.done.length))
        : state.plan;

    if (steps.length === 0) {
      const answer =
        revision.answer?.trim() ||
        revision.critique ||
        "Nada restante no plano.";
      return {
        plan: [],
        answer,
        llmCalls: state.llmCalls + 1,
        trace: [...state.trace, critique],
      };
    }

    return {
      plan: steps,
      llmCalls: state.llmCalls + 1,
      trace: [...state.trace, critique],
    };
  }

  function shouldContinue(state: PEStateType): "executor" | typeof END {
    if (state.answer.trim().length > 0) {
      return END;
    }
    if (state.plan.length === 0) {
      return END;
    }
    if (state.done.length >= MAX_STEPS || state.done.length >= state.maxIterations) {
      return END;
    }
    return "executor";
  }

  const graph = new StateGraph(PEState)
    .addNode("planner", planner)
    .addNode("executor", executor)
    .addEdge(START, "planner")
    .addEdge("planner", "executor");

  if (noReplanner) {
    return graph
      .addConditionalEdges("executor", shouldContinue, {
        executor: "executor",
        [END]: END,
      })
      .compile();
  }

  return graph
    .addNode("replanner", replanner)
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
        const store = options.opsStore ?? createDefaultOpsStore();
        const graph = createPlanExecuteGraph(store, {
          noReplanner: options.noReplanner,
        });
        const finalState = await graph.invoke(
          {
            input,
            plan: [],
            done: [],
            answer: "",
            maxIterations: options.maxIterations,
            trace: [],
            llmCalls: 0,
          },
          {
            // planner + (executor+replanner)*N — corta grafo se o replanner oscilar
            recursionLimit: Math.max(options.maxIterations * 3, 8),
          },
        );

        let answer = finalState.answer?.trim() ?? "";
        if (!answer) {
          answer =
            finalState.done.length >= MAX_STEPS ||
            finalState.done.length >= options.maxIterations
              ? buildLimitReachedAnswer(Math.min(MAX_STEPS, options.maxIterations))
              : finalState.done.at(-1)?.[1] || "Plano concluído sem resposta explícita.";
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
