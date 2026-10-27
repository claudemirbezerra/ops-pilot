import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const outsideConversation = [
  "arena.ts",
  "bench.ts",
  "agents/react.ts",
  "agents/plan-and-execute.ts",
];

test("arena, bench e estratégias não conhecem conversa", () => {
  for (const relative of outsideConversation) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.doesNotMatch(source, /SqliteConversationStore/);
    assert.doesNotMatch(source, /ConversationStore/);
    assert.doesNotMatch(source, /history-prompt/);
    assert.doesNotMatch(source, /HISTORY_LIMIT/);
  }
});
