import assert from "node:assert/strict";
import { test } from "node:test";

import { createLogger } from "./logger.js";

test("logTraceEvent writes one JSON metadata line per call", () => {
  const lines: string[] = [];
  const log = createLogger((line) => {
    lines.push(line);
  });

  log.logTraceEvent({
    requestId: "r1",
    seq: 0,
    type: "thought",
    node: "react",
    ts: 100,
  });
  log.logTraceEvent({
    requestId: "r1",
    seq: 1,
    type: "answer",
    ts: 101,
  });

  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]!.trim()) as Record<string, unknown>;
  const second = JSON.parse(lines[1]!.trim()) as Record<string, unknown>;
  assert.equal(first.requestId, "r1");
  assert.equal(first.seq, 0);
  assert.equal(first.type, "thought");
  assert.equal(first.node, "react");
  assert.equal(first.ts, 100);
  assert.equal(second.seq, 1);
  assert.equal("content" in first, false);
  assert.equal("args" in first, false);
  assert.equal("steps" in first, false);
  assert.equal("payload" in first, false);
});

test("empty trace invents no logTraceEvent lines; request_end is metadata-only", () => {
  const lines: string[] = [];
  const log = createLogger((line) => {
    lines.push(line);
  });

  log.logRequestLife({
    requestId: "r2",
    event: "request_end",
    status: "ok",
    ts: 200,
    node: "answer",
    type: "done",
    tokens: 40,
  });

  assert.equal(lines.length, 1);
  const meta = JSON.parse(lines[0]!.trim()) as Record<string, unknown>;
  assert.equal(meta.requestId, "r2");
  assert.equal(meta.event, "request_end");
  assert.equal(meta.status, "ok");
  assert.equal("content" in meta, false);
  assert.equal("payload" in meta, false);
});

test("info writes a single metadata JSON line", () => {
  const lines: string[] = [];
  const log = createLogger((line) => {
    lines.push(line);
  });
  log.info({
    requestId: "r3",
    node: "answer",
    type: "done",
    tokens: 10,
  });
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!.trim()), {
    requestId: "r3",
    node: "answer",
    type: "done",
    tokens: 10,
  });
});
