import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApprovalUrl, buildChatUrl } from "./api.js";

test("buildChatUrl strips trailing slash and uses /opspilot/chat", () => {
  assert.equal(
    buildChatUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000/opspilot/chat",
  );
});

test("buildApprovalUrl encodes id", () => {
  assert.equal(
    buildApprovalUrl("http://127.0.0.1:3000", "a b"),
    "http://127.0.0.1:3000/opspilot/approvals/a%20b",
  );
});
