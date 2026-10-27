import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEDUP_THRESHOLD,
  RECALL_MIN_SCORE,
  RECALL_TOP_K,
  dot,
  rankRecall,
  shouldDedup,
} from "./similarity.js";

test("dot of orthogonal unit vectors is 0", () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([0, 1, 0]);
  assert.equal(dot(a, b), 0);
});

test("dot of identical unit vectors is ~1", () => {
  const a = new Float32Array([0, 1, 0]);
  assert.ok(Math.abs(dot(a, a) - 1) < 1e-6);
});

test("shouldDedup is strict greater than 0.92", () => {
  assert.equal(DEDUP_THRESHOLD, 0.92);
  assert.equal(shouldDedup(0.92), false);
  assert.equal(shouldDedup(0.9201), true);
});

test("rankRecall filters, tops k, and tie-breaks stably", () => {
  assert.equal(RECALL_MIN_SCORE, 0.3);
  assert.equal(RECALL_TOP_K, 3);

  const ranked = rankRecall([
    { id: "low", createdAt: 1, score: 0.29 },
    { id: "b-late", createdAt: 20, score: 0.5 },
    { id: "b-early", createdAt: 10, score: 0.5 },
    { id: "top", createdAt: 1, score: 0.9 },
    { id: "mid", createdAt: 5, score: 0.4 },
    { id: "extra", createdAt: 3, score: 0.35 },
  ]);

  assert.deepEqual(
    ranked.map((r) => r.id),
    ["top", "b-early", "b-late"],
  );
  assert.ok(ranked.every((r) => r.score >= 0.3));
  assert.equal(ranked.length, 3);
});
