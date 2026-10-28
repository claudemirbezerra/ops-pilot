import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationMessage } from "../domain/types.js";
import {
  SUMMARIZER_PROMPT,
  type ConversationSummarizer,
  type SummarizeInput,
} from "./conversation-summarizer.js";

test("SUMMARIZER_PROMPT asks for ~150 tokens and key facts", () => {
  assert.match(SUMMARIZER_PROMPT, /150 tokens/);
  assert.match(SUMMARIZER_PROMPT, /decisões/i);
  assert.match(SUMMARIZER_PROMPT, /pendências/i);
});

test("fake summarizer records calls and returns deterministic merge text", async () => {
  const calls: SummarizeInput[] = [];
  const fake: ConversationSummarizer = {
    async summarize(input) {
      calls.push(input);
      return `SUMMARY(prev=${input.previousSummary.length};n=${input.egressBatch.length})`;
    },
  };

  const batch: ConversationMessage[] = Array.from({ length: 8 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));

  const first = await fake.summarize({
    previousSummary: "",
    egressBatch: batch,
  });
  assert.equal(first, "SUMMARY(prev=0;n=8)");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.egressBatch.length, 8);

  const second = await fake.summarize({
    previousSummary: first,
    egressBatch: batch,
  });
  assert.equal(second, `SUMMARY(prev=${first.length};n=8)`);
  assert.equal(calls.length, 2);
});
