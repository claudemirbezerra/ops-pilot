export type TraceEvent =
  | { type: "thought"; content: string; node?: string }
  | {
      type: "action";
      tool: string;
      args: Record<string, unknown>;
      node?: string;
    }
  | { type: "observation"; content: string; node?: string }
  | { type: "plan"; steps: string[]; node?: string }
  | { type: "critique"; content: string; node?: string }
  | { type: "answer"; content: string; node?: string }
  | { type: "summarize"; content: string; node?: string }
  | {
      type: "route";
      route: string;
      reason: string;
      override: boolean;
      node?: string;
    }
  | {
      type: "fallback";
      from: string;
      to: string;
      node?: string;
    };

export function formatTraceEvent(event: TraceEvent): string {
  switch (event.type) {
    case "thought":
    case "observation":
    case "critique":
    case "answer":
    case "summarize":
      return event.content;
    case "action":
      return `${event.tool} ${JSON.stringify(event.args)}`;
    case "plan":
      return event.steps.join(" → ");
    case "route":
      return `${event.route}: ${event.reason}`;
    case "fallback":
      return `${event.from} → ${event.to}`;
    default:
      return JSON.stringify(event);
  }
}

export function hasTraceEvents(trace: TraceEvent[] | undefined): boolean {
  return Array.isArray(trace) && trace.length > 0;
}
