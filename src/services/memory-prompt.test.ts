import assert from "node:assert/strict";
import { test } from "node:test";

import { renderMemoryPrompt } from "./memory-prompt.js";

test("empty list renders empty string", () => {
  assert.equal(renderMemoryPrompt([]), "");
});

test("one fact under plantonista header", () => {
  assert.equal(
    renderMemoryPrompt([{ fact: "cluster azul" }]),
    "Memória do plantonista:\n- cluster azul",
  );
});

test("two facts as bullets", () => {
  assert.equal(
    renderMemoryPrompt([{ fact: "a" }, { fact: "b" }]),
    "Memória do plantonista:\n- a\n- b",
  );
});
