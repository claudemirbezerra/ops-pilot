import { z } from "zod";

import { readPromptTokens } from "../context/tokens.js";
import { createModel } from "./model.js";
import type { TraceEvent } from "./strategy.js";

export type CritiqueDecision = {
  approved: boolean;
  feedback: string;
};

export type CriticEvaluateInput = {
  input: string;
  answer: string;
  observations: string[];
};

export type CriticEvaluateResult = CritiqueDecision & {
  /** Real model calls for this evaluation (0 for stubs). */
  llmCalls: number;
  /** Prompt tokens da avaliação (0 em stub ou sem usage). */
  promptTokens: number;
};

export type Critic = {
  evaluate(args: CriticEvaluateInput): Promise<CriticEvaluateResult>;
};

const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z
    .string()
    .describe("Se reprovado: o que corrigir, em específico e acionável"),
});

export const CRITIQUE_PROMPT = `Você é o crítico do OpsPilot. Avalie se a resposta candidata atende o pedido operacional do plantonista, usando as observações do rastro quando existirem.
Aprove somente se a resposta for adequada e fundamentada. Se reprovar, diga o que corrigir de forma específica e acionável.
Ausência de observações não impede a avaliação: use o pedido e a resposta.`;

export function observationsOf(trace: TraceEvent[]): string {
  const observations = trace
    .filter((event) => event.type === "observation")
    .map((event) => (event.type === "observation" ? event.content : ""));
  if (observations.length === 0) {
    return "(nenhuma observação no rastro)";
  }
  return observations.join("\n");
}

/** Structured critique over a strategy result (same shape as the wrap loop). */
export async function critique(
  input: string,
  result: { answer: string; trace: TraceEvent[] },
): Promise<CritiqueDecision> {
  return createModel()
    .withStructuredOutput(verdictSchema)
    .invoke([
      ["system", CRITIQUE_PROMPT],
      [
        "user",
        `Pedido: ${input}\nObservações: ${observationsOf(result.trace)}\nResposta: ${result.answer}`,
      ],
    ]);
}

export function createLlmCritic(): Critic {
  return {
    async evaluate({ input, answer, observations }) {
      const observationText =
        observations.length === 0
          ? "(nenhuma observação no rastro)"
          : observations.join("\n");

      const decision = await createModel()
        .withStructuredOutput(verdictSchema)
        .invoke([
          ["system", CRITIQUE_PROMPT],
          [
            "user",
            `Pedido: ${input}\nObservações: ${observationText}\nResposta: ${answer}`,
          ],
        ]);

      return {
        approved: decision.approved,
        feedback: decision.feedback ?? "",
        llmCalls: 1,
        promptTokens: readPromptTokens(decision),
      };
    },
  };
}
