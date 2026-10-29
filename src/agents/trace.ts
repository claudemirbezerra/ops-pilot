import {
  type BaseMessage,
  isAIMessage,
  isToolMessage,
} from "@langchain/core/messages";

import type { ToolName, TraceEvent } from "./strategy.js";

const TOOL_NAMES = new Set<ToolName>([
  "list_alertas",
  "open_incident",
  "resolver_incident",
  "list_incidents",
  "consultar_runbook",
  "check_provider_status",
  "forget_preference",
]);

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

function asToolName(name: string): ToolName {
  if (TOOL_NAMES.has(name as ToolName)) {
    return name as ToolName;
  }

  return "list_alertas";
}

export function messagesToTrace(messages: BaseMessage[]): TraceEvent[] {
  const events: TraceEvent[] = [];

  for (const message of messages) {
    if (isToolMessage(message)) {
      events.push({ type: "observation", content: messageText(message.content) });
      continue;
    }

    if (isAIMessage(message)) {
      const toolCalls = message.tool_calls ?? [];
      const text = messageText(message.content);

      if (toolCalls.length > 0) {
        if (text.length > 0) {
          events.push({ type: "thought", content: text });
        }
        for (const call of toolCalls) {
          events.push({
            type: "action",
            tool: asToolName(call.name),
            args: (call.args ?? {}) as Record<string, unknown>,
          });
        }
        continue;
      }

      if (text.length > 0) {
        events.push({ type: "answer", content: text });
      }
    }
  }

  return events;
}

export function lastAnswer(messages: BaseMessage[], fallback: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (isAIMessage(message)) {
      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const text = messageText(message.content);
        if (text.length > 0) {
          return text;
        }
      }
    }
  }

  return fallback;
}

export function countAiMessages(messages: BaseMessage[]): number {
  return messages.filter((message) => isAIMessage(message)).length;
}

export function ensureAnswerEvent(trace: TraceEvent[], answer: string): TraceEvent[] {
  const last = trace.at(-1);
  if (last?.type === "answer" && last.content === answer) {
    return trace;
  }

  return [...trace, { type: "answer", content: answer }];
}

export function formatTrace(events: TraceEvent[]): string {
  return events
    .map((event) => {
      switch (event.type) {
        case "thought":
          return `[thought]\n${event.content}`;
        case "action":
          return `[action]\ntool=${event.tool}\nargs=${JSON.stringify(event.args)}`;
        case "observation":
          return `[observation]\n${event.content}`;
        case "plan":
          return `[plan]\n${event.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
        case "critique":
          return `[critique]\n${event.content}`;
        case "answer":
          return `[answer]\n${event.content}`;
        case "summarize":
          return `[summarize]\n${event.content}`;
        case "route":
          return `[route]\nroute=${event.route}\nreason=${event.reason}\noverride=${event.override}`;
      }
    })
    .join("\n\n");
}
