import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationMessage } from "../domain/types.js";
import {
  HISTORY_LIMIT,
  renderHistoryPrompt,
  renderSummaryPrompt,
  selectHistoryWindow,
} from "./history-prompt.js";

test("zero prior messages yields the current plantonista line", () => {
  const window = selectHistoryWindow([], "listar alertas");
  assert.deepEqual(window, [{ role: "user", content: "listar alertas" }]);
  assert.equal(renderHistoryPrompt(window), "Plantonista: listar alertas");
});

test("two prior messages plus the current one stay in order", () => {
  const prior: ConversationMessage[] = [
    { role: "user", content: "oi" },
    { role: "assistant", content: "olá" },
  ];
  const window = selectHistoryWindow(prior, "e agora?");
  assert.equal(window.length, 3);
  assert.equal(
    renderHistoryPrompt(window),
    "Plantonista: oi\nCopiloto: olá\nPlantonista: e agora?",
  );
});

test("eight prior messages drop the oldest when the current one arrives", () => {
  const prior: ConversationMessage[] = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `m${index}`,
  }));
  const window = selectHistoryWindow(prior, "novo");
  assert.equal(HISTORY_LIMIT, 8);
  assert.equal(window.length, 8);
  assert.equal(window[0]?.content, "m1");
  assert.deepEqual(window.at(-1), { role: "user", content: "novo" });
  assert.equal(
    window.some((message) => message.content === "m0"),
    false,
  );
});

test("renderSummaryPrompt returns empty for blank text", () => {
  assert.equal(renderSummaryPrompt(""), "");
  assert.equal(renderSummaryPrompt("   "), "");
});

test("renderSummaryPrompt prefixes non-empty text", () => {
  assert.equal(
    renderSummaryPrompt("  decisão: abrir INC-1  "),
    "Resumo da conversa:\ndecisão: abrir INC-1",
  );
});
