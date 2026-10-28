import type { ConversationMessage } from "../domain/types.js";
import { createModel } from "./model.js";

export type SummarizeInput = {
  previousSummary: string;
  egressBatch: ConversationMessage[];
};

export type ConversationSummarizer = {
  summarize(input: SummarizeInput): Promise<string>;
};

export const SUMMARIZER_PROMPT = `Comprima o trecho de conversa a seguir em no máximo 150 tokens, preservando obrigatoriamente: decisões tomadas, fatos estabelecidos (nomes, datas, prazos, preferencias),
incidentes abertos/resolvidos e pendências abertas. Descarte cumprimentos e conversa social. Se houver um resumo anterior, incorpore-o. 
Responda só o resumo, em tópicos telegráficos.`;

const ROLE_LABEL: Record<ConversationMessage["role"], string> = {
  user: "Plantonista",
  assistant: "Copiloto",
};

function formatEgressBatch(batch: readonly ConversationMessage[]): string {
  return batch
    .map((message) => `${ROLE_LABEL[message.role]}: ${message.content}`)
    .join("\n");
}

function buildUserPayload(input: SummarizeInput): string {
  const parts: string[] = [];
  const prior = input.previousSummary.trim();
  if (prior.length > 0) {
    parts.push(`Resumo anterior:\n${prior}`);
  }
  parts.push(`Trecho a comprimir:\n${formatEgressBatch(input.egressBatch)}`);
  return parts.join("\n\n");
}

function messageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function createLlmConversationSummarizer(): ConversationSummarizer {
  return {
    async summarize(input: SummarizeInput): Promise<string> {
      const result = await createModel().invoke([
        ["system", SUMMARIZER_PROMPT],
        ["user", buildUserPayload(input)],
      ]);
      return messageContent(result.content).trim();
    },
  };
}
