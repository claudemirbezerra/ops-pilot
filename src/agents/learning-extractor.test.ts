import assert from "node:assert/strict";
import test from "node:test";

import { LEARNING_EXTRACTOR_PROMPT } from "./learning-extractor.js";

test("LEARNING_EXTRACTOR_PROMPT covers durable, one-off, and secret rules", () => {
  const prompt = LEARNING_EXTRACTOR_PROMPT.toLowerCase();
  assert.match(prompt, /durável|duravel/);
  assert.match(prompt, /pedido pontual|pontual/);
  assert.ok(
    prompt.includes("segredo") ||
      prompt.includes("token") ||
      prompt.includes("credencial") ||
      prompt.includes("api key"),
  );
});
