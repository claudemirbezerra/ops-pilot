import assert from "node:assert/strict";
import { test } from "node:test";

import type { PersistedTraceEvent } from "../domain/types.js";
import { SqliteRequestStore } from "./sqlite-request-store.js";

test("save + getById round-trip with ordered multi-event trace", () => {
  const store = new SqliteRequestStore(":memory:");
  const trace: PersistedTraceEvent[] = [
    { type: "thought", content: "pensar", node: "react" },
    { type: "answer", content: "ok", node: "response" },
  ];
  const metrics = {
    llmCalls: 1,
    latencyMs: 12,
    promptTokens: 40,
    historyMessages: 1,
    contextBreakdown: { history: 0, memory: 0, summary: 0 },
  };

  store.save({
    id: "req-1",
    createdAt: 1_700_000_000_000,
    metrics,
    trace,
  });

  const saved = store.getById("req-1");
  assert.ok(saved);
  assert.equal(saved.requestId, "req-1");
  assert.equal(saved.createdAt, 1_700_000_000_000);
  assert.deepEqual(saved.metrics, metrics);
  assert.deepEqual(saved.trace, trace);
});

test("save with empty trace still returns request", () => {
  const store = new SqliteRequestStore(":memory:");
  store.save({
    id: "req-empty",
    createdAt: 1,
    metrics: { llmCalls: 0, latencyMs: 0, promptTokens: 0 },
    trace: [],
  });
  const saved = store.getById("req-empty");
  assert.ok(saved);
  assert.deepEqual(saved.trace, []);
});

test("getById unknown returns null", () => {
  const store = new SqliteRequestStore(":memory:");
  assert.equal(store.getById("missing"), null);
});
