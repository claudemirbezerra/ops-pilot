import { ModelUnavailableError } from "../domain/errors.js";
import { createLlmCritic, type Critic, type CritiqueDecision } from "./critic.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { reactStrategy } from "./react.js";
import {
  MODEL_UNAVAILABLE_ANSWER,
  buildEmptyInputResult,
  isBlankInput,
  type ReasoningStrategy,
  type StrategyName,
  type StrategyOptions,
  type StrategyResult,
  type TraceEvent,
} from "./strategy.js";

export const DEFAULT_REJECT_FEEDBACK =
  "A resposta foi reprovada sem detalhe adicional.";

export const CRITIC_UNAVAILABLE_CONTENT =
  "Crítico indisponível: a avaliação não pôde ser concluída. Mantida a última resposta da base.";

export function extractObservations(trace: TraceEvent[]): string[] {
  return trace
    .filter((event): event is Extract<TraceEvent, { type: "observation" }> => {
      return event.type === "observation";
    })
    .map((event) => event.content);
}

export function buildFeedbackInput(original: string, feedback: string): string {
  const detail = feedback.trim().length > 0 ? feedback.trim() : DEFAULT_REJECT_FEEDBACK;
  return `${original}\n\n[Feedback do crítico]\n${detail}`;
}

export function formatCritiqueContent(decision: CritiqueDecision): string {
  if (decision.approved) {
    const extra = decision.feedback.trim();
    return extra.length > 0 ? `Aprovado. ${extra}` : "Aprovado.";
  }
  const detail =
    decision.feedback.trim().length > 0
      ? decision.feedback.trim()
      : DEFAULT_REJECT_FEEDBACK;
  return `Reprovado: ${detail}`;
}

export function ensureFinalAnswer(trace: TraceEvent[], answer: string): TraceEvent[] {
  const last = trace.at(-1);
  if (last?.type === "answer" && last.content === answer) {
    return trace;
  }
  return [...trace, { type: "answer", content: answer }];
}

function hasUsefulCandidate(answer: string): boolean {
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return trimmed !== MODEL_UNAVAILABLE_ANSWER;
}

export type WrapWithReflectionParams = {
  base: ReasoningStrategy;
  critic: Critic;
  name: Extract<StrategyName, "reflect:react" | "reflect:plan-and-execute">;
};

export function wrapWithReflection({
  base,
  critic,
  name,
}: WrapWithReflectionParams): ReasoningStrategy {
  return {
    name,
    async run(input: string, options: StrategyOptions): Promise<StrategyResult> {
      if (isBlankInput(input)) {
        return buildEmptyInputResult();
      }

      const maxReflections = options.maxReflections ?? 2;
      const started = Date.now();
      let remaining = maxReflections;
      let currentInput = input;
      let originalInput = input;
      let accumulatedTrace: TraceEvent[] = [];
      let llmCalls = 0;
      let promptTokens = 0;
      let modelUsed: string | undefined;
      let lastAnswer = "";

      const metricsOf = () => ({
        llmCalls,
        latencyMs: Date.now() - started,
        promptTokens,
        ...(modelUsed !== undefined ? { modelUsed } : {}),
      });

      while (true) {
        const baseResult = await base.run(currentInput, {
          maxIterations: options.maxIterations,
        });
        llmCalls += baseResult.metrics.llmCalls;
        promptTokens += baseResult.metrics.promptTokens;
        if (baseResult.metrics.modelUsed !== undefined) {
          modelUsed = baseResult.metrics.modelUsed;
        }
        accumulatedTrace = [...accumulatedTrace, ...baseResult.trace];
        lastAnswer = baseResult.answer;

        if (baseResult.pendingApproval !== undefined) {
          return {
            answer: lastAnswer,
            trace: accumulatedTrace,
            metrics: metricsOf(),
            pendingApproval: baseResult.pendingApproval,
          };
        }

        if (!hasUsefulCandidate(baseResult.answer)) {
          return {
            answer: lastAnswer,
            trace: ensureFinalAnswer(accumulatedTrace, lastAnswer),
            metrics: metricsOf(),
          };
        }

        let decision: CritiqueDecision;
        try {
          const evaluated = await critic.evaluate({
            input: originalInput,
            answer: baseResult.answer,
            observations: extractObservations(baseResult.trace),
          });
          llmCalls += evaluated.llmCalls;
          promptTokens += evaluated.promptTokens;
          decision = {
            approved: evaluated.approved,
            feedback: evaluated.feedback,
          };
          accumulatedTrace = [
            ...accumulatedTrace,
            { type: "critique", content: formatCritiqueContent(decision) },
          ];
        } catch (error: unknown) {
          if (error instanceof ModelUnavailableError) {
            throw error;
          }
          accumulatedTrace = [
            ...accumulatedTrace,
            { type: "critique", content: CRITIC_UNAVAILABLE_CONTENT },
          ];
          return {
            answer: lastAnswer,
            trace: ensureFinalAnswer(accumulatedTrace, lastAnswer),
            metrics: metricsOf(),
          };
        }

        if (decision.approved) {
          return {
            answer: lastAnswer,
            trace: ensureFinalAnswer(accumulatedTrace, lastAnswer),
            metrics: metricsOf(),
          };
        }

        if (remaining <= 0) {
          return {
            answer: lastAnswer,
            trace: ensureFinalAnswer(accumulatedTrace, lastAnswer),
            metrics: metricsOf(),
          };
        }

        remaining -= 1;
        currentInput = buildFeedbackInput(originalInput, decision.feedback);
      }
    },
  };
}

export function createReflectReactStrategy(critic: Critic = createLlmCritic()): ReasoningStrategy {
  return wrapWithReflection({
    base: reactStrategy,
    critic,
    name: "reflect:react",
  });
}

export function createReflectPlanAndExecuteStrategy(
  critic: Critic = createLlmCritic(),
): ReasoningStrategy {
  return wrapWithReflection({
    base: planAndExecuteStrategy,
    critic,
    name: "reflect:plan-and-execute",
  });
}

export const reflectReactStrategy = createReflectReactStrategy();
export const reflectPlanAndExecuteStrategy = createReflectPlanAndExecuteStrategy();
