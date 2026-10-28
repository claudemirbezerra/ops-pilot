import assert from "node:assert/strict";
import test from "node:test";

import { createInMemorySeededStore, summarizeOpsStore } from "./store.js";
import {
  EMPTY_INPUT_ANSWER,
  buildEmptyInputResult,
  isBlankInput,
  runWithMetrics,
} from "./strategy.js";

test("pedido vazio devolve answer único sem chamar o modelo", () => {
  assert.equal(isBlankInput("   "), true);

  const result = buildEmptyInputResult();
  const storeBefore = summarizeOpsStore(createInMemorySeededStore());
  const storeAfter = summarizeOpsStore(createInMemorySeededStore());

  assert.equal(result.answer, EMPTY_INPUT_ANSWER);
  assert.deepEqual(result.trace, [{ type: "answer", content: EMPTY_INPUT_ANSWER }]);
  assert.equal(result.metrics.llmCalls, 0);
  assert.equal(result.metrics.promptTokens, 0);
  assert.deepEqual(storeBefore, storeAfter);
});

test("runWithMetrics preserves promptTokens from work", async () => {
  const result = await runWithMetrics(async () => ({
    answer: "ok",
    trace: [{ type: "answer", content: "ok" }],
    metrics: { llmCalls: 1, promptTokens: 7 },
  }));
  assert.equal(result.metrics.promptTokens, 7);
  assert.equal(result.metrics.llmCalls, 1);
  assert.ok(result.metrics.latencyMs >= 0);
});
