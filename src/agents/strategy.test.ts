import assert from "node:assert/strict";
import test from "node:test";

import { createStoreFromPrimaryCatalog, summarizeStore } from "./store.js";
import {
  EMPTY_INPUT_ANSWER,
  buildEmptyInputResult,
  isBlankInput,
} from "./strategy.js";

test("pedido vazio devolve answer único sem chamar o modelo", () => {
  assert.equal(isBlankInput("   "), true);

  const result = buildEmptyInputResult();
  const storeBefore = summarizeStore(createStoreFromPrimaryCatalog());
  const storeAfter = summarizeStore(createStoreFromPrimaryCatalog());

  assert.equal(result.answer, EMPTY_INPUT_ANSWER);
  assert.deepEqual(result.trace, [{ type: "answer", content: EMPTY_INPUT_ANSWER }]);
  assert.equal(result.metrics.llmCalls, 0);
  assert.deepEqual(storeBefore, storeAfter);
});
