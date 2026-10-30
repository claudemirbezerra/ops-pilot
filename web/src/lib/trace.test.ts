import assert from "node:assert/strict";
import { test } from "node:test";

import { formatTraceEvent, hasTraceEvents, type TraceEvent } from "./trace.js";

test("hasTraceEvents", () => {
  assert.equal(hasTraceEvents([]), false);
  assert.equal(hasTraceEvents(undefined), false);
  assert.equal(
    hasTraceEvents([{ type: "thought", content: "x" }]),
    true,
  );
});

test("formatTraceEvent exposes type content", () => {
  const events: TraceEvent[] = [
    { type: "thought", content: "pensar" },
    { type: "action", tool: "list_alertas", args: { status: "firing" } },
  ];
  assert.equal(formatTraceEvent(events[0]!), "pensar");
  assert.match(formatTraceEvent(events[1]!), /list_alertas/);
});
