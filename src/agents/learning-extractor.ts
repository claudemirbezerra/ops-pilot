import { z } from "zod";

import { createModel } from "./model.js";

export type LearningDecision = {
  hasLearning: boolean;
  fact: string;
};

export type LearningExtractor = {
  extract(userMessage: string): Promise<LearningDecision>;
};

export const learningDecisionSchema = z.object({
  hasLearning: z.boolean(),
  fact: z.string(),
});

export const LEARNING_EXTRACTOR_PROMPT = `Você é o refletor de aprendizado do OpsPilot.
Analise APENAS a última mensagem do plantonista e decida se há um fato durável a guardar.

Regras:
- hasLearning: true somente para preferência ou fato operacional DURÁVEL (ex.: dono de produto, cluster preferido, handoff, forma estável de trabalhar).
- Pedido pontual de plantão (abrir/resolver incidente, listar alertas, status de provedor, pergunta só deste turno) → hasLearning: false e fact: "".
- Segredo (senha, token, API key, credencial, connection string com senha) → hasLearning: false e fact: "" — NUNCA copie o segredo para fact.
- Mensagem mista: no máximo UM fato durável em fact; omita o pedido pontual e qualquer segredo do texto.
- Sem aprendizado claro → hasLearning: false e fact: "".
- fact deve ser uma afirmação curta e autocontida, sem credenciais.`;

export function createLlmLearningExtractor(): LearningExtractor {
  return {
    async extract(userMessage: string): Promise<LearningDecision> {
      const decision = await createModel()
        .withStructuredOutput(learningDecisionSchema)
        .invoke([
          ["system", LEARNING_EXTRACTOR_PROMPT],
          ["user", userMessage],
        ]);

      return {
        hasLearning: decision.hasLearning,
        fact: decision.fact ?? "",
      };
    },
  };
}
