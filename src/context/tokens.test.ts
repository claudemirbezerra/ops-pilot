import assert from "node:assert/strict";
import test from "node:test";

import { estimateTokens, readPromptTokens } from "./tokens.js";

test("estimateTokens: empty and short strings", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("a"), 0);
  assert.equal(estimateTokens("ab"), 0);
  assert.equal(estimateTokens("abc"), 0);
});

test("estimateTokens: chars ÷ 4 integer division", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 1);
  assert.equal(estimateTokens("abcdefgh"), 2);
});

test("estimateTokens: does not trim spaces", () => {
  assert.equal(estimateTokens("    "), 1);
  assert.equal(estimateTokens(" a  "), 1);
});

test("readPromptTokens: usage_metadata.input_tokens", () => {
  assert.equal(
    readPromptTokens({ usage_metadata: { input_tokens: 42 } }),
    42,
  );
  assert.equal(
    readPromptTokens({ usage_metadata: { input_tokens: 7 } }),
    7,
  );
});

test("readPromptTokens: response_metadata.tokenUsage", () => {
  assert.equal(
    readPromptTokens({
      response_metadata: { tokenUsage: { prompt_tokens: 10 } },
    }),
    10,
  );
  assert.equal(
    readPromptTokens({
      response_metadata: { tokenUsage: { promptTokens: 11 } },
    }),
    11,
  );
});

test("readPromptTokens: absent or partial → 0", () => {
  assert.equal(readPromptTokens(undefined), 0);
  assert.equal(readPromptTokens({}), 0);
  assert.equal(
    readPromptTokens({ usage_metadata: { output_tokens: 5 } }),
    0,
  );
  assert.equal(
    readPromptTokens({ usage_metadata: { input_tokens: -3 } }),
    0,
  );
  assert.equal(
    readPromptTokens({ usage_metadata: { input_tokens: Number.NaN } }),
    0,
  );
});
