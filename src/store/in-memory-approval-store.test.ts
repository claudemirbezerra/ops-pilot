import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ApprovalAlreadyResolvedError,
  ApprovalNotFoundError,
} from "../domain/errors.js";
import type { PendingApproval } from "../domain/types.js";
import { InMemoryApprovalStore } from "./in-memory-approval-store.js";

function sample(id = "a1"): PendingApproval {
  return {
    id,
    createdAt: 1,
    status: "pending",
    tool: "resolver_incident",
    args: { id: 1 },
    description: "resolver_incident (id=1)",
    requestId: "r1",
    trace: [{ type: "action", tool: "resolver_incident", args: { id: 1 } }],
    metrics: { llmCalls: 1 },
  };
}

test("save + getById round-trip", () => {
  const store = new InMemoryApprovalStore();
  store.save(sample());
  const got = store.getById("a1");
  assert.ok(got);
  assert.equal(got.status, "pending");
  assert.equal(got.tool, "resolver_incident");
});

test("getById unknown → null", () => {
  assert.equal(new InMemoryApprovalStore().getById("nope"), null);
});

test("resolve approve then second resolve → 409 domain", () => {
  const store = new InMemoryApprovalStore();
  store.save(sample());
  const first = store.resolve("a1", "approve");
  assert.equal(first.status, "approved");
  assert.ok(first.resolvedAt !== undefined);
  assert.throws(() => store.resolve("a1", "deny"), ApprovalAlreadyResolvedError);
});

test("resolve unknown → ApprovalNotFoundError", () => {
  assert.throws(
    () => new InMemoryApprovalStore().resolve("missing", "approve"),
    ApprovalNotFoundError,
  );
});

test("resolve deny sets denied", () => {
  const store = new InMemoryApprovalStore();
  store.save(sample("d1"));
  const denied = store.resolve("d1", "deny");
  assert.equal(denied.status, "denied");
});
