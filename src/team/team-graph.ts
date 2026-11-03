import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import {
  describePendingApproval,
  findApprovalError,
  HumanApprovalRequiredError,
} from "../agents/approval-gate.js";
import { createModel } from "../agents/model.js";
import { createDefaultOpsStore } from "../agents/store.js";
import {
  runWithMetrics,
  type PendingApprovalInfo,
  type ReasoningStrategy,
  type StrategyOptions,
  type StrategyResult,
  type TeamNext,
  type ToolName,
  type TraceEvent,
} from "../agents/strategy.js";
import { readPromptTokens } from "../context/tokens.js";
import {
  InvalidTeamDecisionError,
  InvalidTeamRoleError,
  MissingModelConfigError,
  ModelUnavailableError,
} from "../domain/errors.js";
import { createOpsTools } from "../agents/tools.js";
import {
  applyRoleUpdate,
  emptyBoard,
  renderBoard,
  type Blackboard,
  type TeamRoleName,
} from "./board.js";
import {
  ANALISTA_ALLOWLIST,
  ANALISTA_PROMPT,
  buildHandoffEvent,
  ceilingAnswer,
  EXECUTOR_ALLOWLIST,
  EXECUTOR_PROMPT,
  parseTeamDecision,
  PLANEJADOR_PROMPT,
  resolveTeamToolUse,
  SUPERVISOR_PROMPT,
  TEAM_DENIED_OBSERVATION,
  TEAM_MAX_HANDOFFS,
} from "./policy.js";

const nextSchema = z.object({
  next: z.enum(["analista", "planejador", "executor", "encerrar"]),
  brief: z
    .string()
    .describe(
      "instrução de trabalho para o próximo nó ou resumo final se encerrar",
    ),
});

const stepsSchema = z.object({
  steps: z.array(z.string()).describe("passos ordenados do plano"),
});

export type TeamSupervisor = {
  decide(input: {
    prompt: string;
    blackboard: Blackboard;
  }): Promise<{
    next: TeamNext;
    brief: string;
    llmCalls: number;
    promptTokens: number;
    modelUsed?: string;
  }>;
};

export type TeamToolRequest = {
  name: string;
  args: Record<string, unknown>;
  observation?: string;
};

export type TeamRoleOutput = {
  findings?: string;
  steps?: string[];
  incident?: string;
  toolCalls?: TeamToolRequest[];
  pendingApproval?: PendingApprovalInfo;
  llmCalls?: number;
  promptTokens?: number;
  modelUsed?: string;
};

export type TeamRole = {
  run(input: {
    prompt: string;
    brief: string;
    blackboard: Blackboard;
  }): Promise<TeamRoleOutput>;
  invokeTool?(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string>;
};

export type TeamRoles = Record<TeamRoleName, TeamRole>;

export type RunTeamGraphInput = {
  prompt: string;
  requestMessage?: string;
  supervisor: TeamSupervisor;
  roles: TeamRoles;
};

const TOOL_NAMES = new Set<ToolName>([
  "list_alertas",
  "open_incident",
  "resolver_incident",
  "list_incidents",
  "consultar_runbook",
  "check_provider_status",
  "forget_preference",
]);

function isToolName(name: string): name is ToolName {
  return TOOL_NAMES.has(name as ToolName);
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
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

function splitStructured(result: unknown): { parsed: unknown; raw: unknown } {
  if (result !== null && typeof result === "object" && "parsed" in result) {
    const box = result as { parsed: unknown; raw?: unknown };
    return { parsed: box.parsed, raw: "raw" in box ? box.raw : result };
  }
  return { parsed: result, raw: result };
}

function rethrowKnown(error: unknown): never {
  if (
    error instanceof ModelUnavailableError ||
    error instanceof InvalidTeamDecisionError ||
    error instanceof InvalidTeamRoleError ||
    error instanceof MissingModelConfigError
  ) {
    throw error;
  }
  throw error;
}

function findKnownError(
  error: unknown,
  seen: Set<unknown> = new Set(),
): Error | null {
  if (error == null || (typeof error !== "object" && typeof error !== "function")) {
    return null;
  }
  if (seen.has(error)) {
    return null;
  }
  seen.add(error);
  if (
    error instanceof InvalidTeamDecisionError ||
    error instanceof InvalidTeamRoleError ||
    error instanceof ModelUnavailableError ||
    error instanceof MissingModelConfigError
  ) {
    return error;
  }
  if (error instanceof Error) {
    const withExtras = error as Error & { cause?: unknown; errors?: unknown[] };
    const fromCause = findKnownError(withExtras.cause, seen);
    if (fromCause) {
      return fromCause;
    }
    if (Array.isArray(withExtras.errors)) {
      for (const nested of withExtras.errors) {
        const found = findKnownError(nested, seen);
        if (found) {
          return found;
        }
      }
    }
  }
  return null;
}

export function createTeamSupervisor(): TeamSupervisor {
  return {
    async decide({ prompt, blackboard }) {
      try {
        const model = createModel();
        const result = await model
          .withStructuredOutput(nextSchema, { includeRaw: true })
          .invoke([
            ["system", SUPERVISOR_PROMPT],
            ["user", `${prompt}\n\n${renderBoard(blackboard)}`],
          ]);
        const { parsed, raw } = splitStructured(result);
        const decision = parseTeamDecision(parsed);
        const modelUsed = model.getModelUsed();
        return {
          next: decision.next,
          brief: decision.brief,
          llmCalls: 1,
          promptTokens: readPromptTokens(raw),
          ...(modelUsed !== undefined ? { modelUsed } : {}),
        };
      } catch (error: unknown) {
        if (
          error instanceof ModelUnavailableError ||
          error instanceof InvalidTeamDecisionError ||
          error instanceof MissingModelConfigError
        ) {
          throw error;
        }
        throw new InvalidTeamDecisionError();
      }
    },
  };
}

type OpsTool = ReturnType<typeof createOpsTools>["tools"][number];

function selectTools(tools: readonly OpsTool[], names: readonly string[]): OpsTool[] {
  const allowed = new Set<string>(names);
  return tools.filter((item) => allowed.has(item.name));
}

async function invokeNamedTool(
  tools: readonly OpsTool[],
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const selected = tools.find((item) => item.name === name);
  if (!selected) {
    return TEAM_DENIED_OBSERVATION;
  }
  const invoke = selected.invoke.bind(selected) as (
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  const raw = await invoke(args);
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

export function createTeamRoles(options: StrategyOptions = { maxIterations: 8 }): TeamRoles {
  const store = options.opsStore ?? createDefaultOpsStore();
  const { tools } = createOpsTools(store, {
    userId: options.userId,
    memoryStore: options.memoryStore,
  });
  const analystTools = selectTools(tools, ANALISTA_ALLOWLIST);
  const executorTools = selectTools(tools, EXECUTOR_ALLOWLIST);

  return {
    analista: {
      async run({ prompt, brief, blackboard }) {
        try {
          const model = createModel();
          const ai = await model.bindTools(analystTools).invoke([
            ["system", ANALISTA_PROMPT],
            ["user", `${prompt}\n\nBrief: ${brief}\n\n${renderBoard(blackboard)}`],
          ]);
          const modelUsed = model.getModelUsed();
          return {
            findings: messageText(ai.content),
            toolCalls: (ai.tool_calls ?? []).map((call) => ({
              name: call.name,
              args: (call.args ?? {}) as Record<string, unknown>,
            })),
            llmCalls: 1,
            promptTokens: readPromptTokens(ai),
            ...(modelUsed !== undefined ? { modelUsed } : {}),
          };
        } catch (error: unknown) {
          rethrowKnown(error);
        }
      },
      async invokeTool(name, args) {
        if (resolveTeamToolUse("analista", name).kind !== "invoke") {
          return TEAM_DENIED_OBSERVATION;
        }
        return invokeNamedTool(analystTools, name, args);
      },
    },
    planejador: {
      async run({ prompt, brief, blackboard }) {
        try {
          const model = createModel();
          const result = await model
            .withStructuredOutput(stepsSchema, { includeRaw: true })
            .invoke([
              ["system", PLANEJADOR_PROMPT],
              ["user", `${prompt}\n\nBrief: ${brief}\n\n${renderBoard(blackboard)}`],
            ]);
          const { parsed, raw } = splitStructured(result);
          const stepsRaw =
            parsed !== null &&
            typeof parsed === "object" &&
            "steps" in parsed &&
            Array.isArray((parsed as { steps: unknown }).steps)
              ? (parsed as { steps: unknown[] }).steps
              : [];
          const steps = stepsRaw.filter((step): step is string => typeof step === "string");
          if (steps.length === 0 || steps.some((step) => step.trim().length === 0)) {
            throw new InvalidTeamRoleError();
          }
          const modelUsed = model.getModelUsed();
          return {
            steps: steps.map((step) => step.trim()),
            llmCalls: 1,
            promptTokens: readPromptTokens(raw),
            ...(modelUsed !== undefined ? { modelUsed } : {}),
          };
        } catch (error: unknown) {
          if (
            error instanceof ModelUnavailableError ||
            error instanceof MissingModelConfigError ||
            error instanceof InvalidTeamRoleError
          ) {
            throw error;
          }
          throw new InvalidTeamRoleError();
        }
      },
    },
    executor: {
      async run({ prompt, brief, blackboard }) {
        try {
          const model = createModel();
          const ai = await model.bindTools(executorTools).invoke([
            ["system", EXECUTOR_PROMPT],
            ["user", `${prompt}\n\nBrief: ${brief}\n\n${renderBoard(blackboard)}`],
          ]);
          const modelUsed = model.getModelUsed();
          return {
            incident: messageText(ai.content),
            toolCalls: (ai.tool_calls ?? []).map((call) => ({
              name: call.name,
              args: (call.args ?? {}) as Record<string, unknown>,
            })),
            llmCalls: 1,
            promptTokens: readPromptTokens(ai),
            ...(modelUsed !== undefined ? { modelUsed } : {}),
          };
        } catch (error: unknown) {
          rethrowKnown(error);
        }
      },
    },
  };
}

const TeamState = Annotation.Root({
  prompt: Annotation<string>,
  blackboard: Annotation<Blackboard>,
  handoffs: Annotation<number>,
  trace: Annotation<TraceEvent[]>,
  answer: Annotation<string>,
  llmCalls: Annotation<number>,
  promptTokens: Annotation<number>,
  modelUsed: Annotation<string | undefined>,
  pendingApproval: Annotation<PendingApprovalInfo | undefined>,
  done: Annotation<boolean>,
  next: Annotation<TeamNext | undefined>,
  brief: Annotation<string>,
});

type TeamStateType = typeof TeamState.State;

function finishApproval(
  state: TeamStateType,
  tool: ToolName,
  args: Record<string, unknown>,
  extraTrace: TraceEvent[],
  llmCalls: number,
  promptTokens: number,
  modelUsed: string | undefined,
): Partial<TeamStateType> {
  return {
    done: true,
    pendingApproval: {
      tool,
      args,
      description: describePendingApproval(tool, args),
    },
    trace: [
      ...state.trace,
      ...extraTrace,
      { type: "action", tool, args, node: "team" },
    ],
    llmCalls: state.llmCalls + llmCalls,
    promptTokens: state.promptTokens + promptTokens,
    modelUsed: modelUsed ?? state.modelUsed,
  };
}

function createTeamGraph(supervisor: TeamSupervisor, roles: TeamRoles) {
  async function supervisorNode(
    state: TeamStateType,
  ): Promise<Partial<TeamStateType>> {
    if (state.handoffs >= TEAM_MAX_HANDOFFS) {
      return {
        answer: ceilingAnswer(),
        done: true,
      };
    }

    const verdict = await supervisor.decide({
      prompt: state.prompt,
      blackboard: state.blackboard,
    });
    const decision = parseTeamDecision(verdict);
    const handoff = buildHandoffEvent(decision.next, decision.brief);
    const shared = {
      next: decision.next,
      brief: decision.brief,
      handoffs: state.handoffs + 1,
      trace: [...state.trace, handoff],
      llmCalls: state.llmCalls + (verdict.llmCalls ?? 0),
      promptTokens: state.promptTokens + (verdict.promptTokens ?? 0),
      modelUsed: verdict.modelUsed ?? state.modelUsed,
    };

    if (decision.next === "encerrar") {
      return {
        ...shared,
        answer: decision.brief,
        done: true,
      };
    }

    return {
      ...shared,
      done: false,
    };
  }

  async function roleNode(
    state: TeamStateType,
    roleName: TeamRoleName,
  ): Promise<Partial<TeamStateType>> {
    const role = roles[roleName];
    let modelUsed = state.modelUsed;
    try {
      const output = await role.run({
        prompt: state.prompt,
        brief: state.brief,
        blackboard: state.blackboard,
      });
      modelUsed = output.modelUsed ?? modelUsed;
      const llmCalls = output.llmCalls ?? 0;
      const promptTokens = output.promptTokens ?? 0;

      if (roleName === "executor" && output.pendingApproval) {
        throw new HumanApprovalRequiredError({
          tool: output.pendingApproval.tool,
          args: output.pendingApproval.args,
          llmCalls,
          promptTokens,
        });
      }

      if (roleName === "planejador") {
        const steps = output.steps ?? [];
        if (steps.length === 0 || steps.some((step) => step.trim().length === 0)) {
          throw new InvalidTeamRoleError();
        }
      }

      const events: TraceEvent[] = [];
      let board = state.blackboard;

      for (const call of output.toolCalls ?? []) {
        const args = call.args ?? {};
        const use = resolveTeamToolUse(roleName, call.name);
        if (use.kind === "deny") {
          if (isToolName(call.name)) {
            events.push({ type: "action", tool: call.name, args, node: "team" });
          }
          events.push({
            type: "observation",
            content: TEAM_DENIED_OBSERVATION,
            node: "team",
          });
          continue;
        }
        if (use.kind === "approval") {
          if (!isToolName(call.name)) {
            throw new InvalidTeamRoleError();
          }
          throw new HumanApprovalRequiredError({
            tool: call.name,
            args,
            trace: events,
            llmCalls,
            promptTokens,
          });
        }
        const observation =
          call.observation ??
          (role.invokeTool ? await role.invokeTool(call.name, args) : "");
        if (isToolName(call.name)) {
          events.push({ type: "action", tool: call.name, args, node: "team" });
        }
        events.push({ type: "observation", content: observation, node: "team" });
      }

      if (roleName === "analista") {
        const findings = output.findings ?? "";
        if (findings.length > 0) {
          board = applyRoleUpdate(board, { role: "analista", findings });
          events.push({ type: "observation", content: findings, node: "team" });
        }
      }

      if (roleName === "planejador") {
        const steps = (output.steps ?? []).map((step) => step.trim());
        board = applyRoleUpdate(board, { role: "planejador", plan: steps });
        events.push({ type: "plan", steps, node: "team" });
      }

      if (roleName === "executor") {
        const incident = output.incident ?? "";
        if (incident.length > 0) {
          board = applyRoleUpdate(board, { role: "executor", incident });
        }
      }

      return {
        blackboard: board,
        trace: [...state.trace, ...events],
        llmCalls: state.llmCalls + llmCalls,
        promptTokens: state.promptTokens + promptTokens,
        modelUsed,
        done: false,
      };
    } catch (error: unknown) {
      const approval = findApprovalError(error);
      if (roleName === "executor" && approval && isToolName(approval.tool)) {
        return finishApproval(
          state,
          approval.tool,
          approval.args,
          approval.trace,
          approval.llmCalls,
          approval.promptTokens,
          modelUsed,
        );
      }
      const known = findKnownError(error);
      if (known) {
        throw known;
      }
      throw error;
    }
  }

  function afterSupervisor(
    state: TeamStateType,
  ): "analista" | "planejador" | "executor" | typeof END {
    if (state.done || state.next === undefined || state.next === "encerrar") {
      return END;
    }
    return state.next;
  }

  function afterExecutor(state: TeamStateType): "supervisor" | typeof END {
    if (state.done || state.pendingApproval !== undefined) {
      return END;
    }
    return "supervisor";
  }

  return new StateGraph(TeamState)
    .addNode("supervisor", supervisorNode)
    .addNode("analista", (state) => roleNode(state, "analista"))
    .addNode("planejador", (state) => roleNode(state, "planejador"))
    .addNode("executor", (state) => roleNode(state, "executor"))
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", afterSupervisor, {
      analista: "analista",
      planejador: "planejador",
      executor: "executor",
      [END]: END,
    })
    .addEdge("analista", "supervisor")
    .addEdge("planejador", "supervisor")
    .addConditionalEdges("executor", afterExecutor, {
      supervisor: "supervisor",
      [END]: END,
    })
    .compile();
}

export async function runTeamGraph(
  input: RunTeamGraphInput,
): Promise<StrategyResult> {
  return runWithMetrics(async () => {
    const graph = createTeamGraph(input.supervisor, input.roles);
    let finalState: TeamStateType;
    try {
      finalState = await graph.invoke(
        {
          prompt: input.prompt,
          blackboard: emptyBoard(input.requestMessage ?? ""),
          handoffs: 0,
          trace: [],
          answer: "",
          llmCalls: 0,
          promptTokens: 0,
          modelUsed: undefined,
          pendingApproval: undefined,
          done: false,
          next: undefined,
          brief: "",
        },
        { recursionLimit: TEAM_MAX_HANDOFFS * 2 + 4 },
      );
    } catch (error: unknown) {
      const known = findKnownError(error);
      if (known) {
        throw known;
      }
      throw error;
    }

    return {
      answer: finalState.answer,
      trace: finalState.trace,
      ...(finalState.pendingApproval !== undefined
        ? { pendingApproval: finalState.pendingApproval }
        : {}),
      metrics: {
        llmCalls: finalState.llmCalls,
        promptTokens: finalState.promptTokens,
        ...(finalState.modelUsed !== undefined
          ? { modelUsed: finalState.modelUsed }
          : {}),
      },
    };
  });
}

export const teamStrategy: ReasoningStrategy = {
  name: "team",
  run(input, options) {
    return runTeamGraph({
      prompt: input,
      requestMessage: options.requestMessage ?? "",
      supervisor: createTeamSupervisor(),
      roles: createTeamRoles(options),
    });
  },
};
