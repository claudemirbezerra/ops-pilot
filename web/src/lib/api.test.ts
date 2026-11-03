import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApprovalUrl, buildChatUrl, postChat } from "./api.js";

test("buildChatUrl strips trailing slash and uses /opspilot/chat", () => {
  assert.equal(
    buildChatUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000/opspilot/chat",
  );
});

test("postChat maps an aborted fetch to kind aborted", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };
  try {
    const result = await postChat(
      "listar alertas",
      "http://127.0.0.1:3000",
      AbortSignal.abort(),
    );
    assert.equal(result.kind, "aborted");
  } finally {
    globalThis.fetch = original;
  }
});

test("buildApprovalUrl encodes id", () => {
  assert.equal(
    buildApprovalUrl("http://127.0.0.1:3000", "a b"),
    "http://127.0.0.1:3000/opspilot/approvals/a%20b",
  );
});
