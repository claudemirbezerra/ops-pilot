import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TOOLS_REQUIRING_HUMAN_APPROVAL,
  describePendingApproval,
  requiresHumanApproval,
} from "./approval-gate.js";

test("TOOLS_REQUIRING_HUMAN_APPROVAL contains only open_incident and resolver_incident", () => {
  assert.equal(TOOLS_REQUIRING_HUMAN_APPROVAL.size, 2);
  assert.ok(TOOLS_REQUIRING_HUMAN_APPROVAL.has("open_incident"));
  assert.ok(TOOLS_REQUIRING_HUMAN_APPROVAL.has("resolver_incident"));
});

test("requiresHumanApproval is true only for gated tools", () => {
  assert.equal(requiresHumanApproval("open_incident"), true);
  assert.equal(requiresHumanApproval("resolver_incident"), true);
  assert.equal(requiresHumanApproval("list_alertas"), false);
  assert.equal(requiresHumanApproval("list_incidents"), false);
  assert.equal(requiresHumanApproval("consultar_runbook"), false);
  assert.equal(requiresHumanApproval("check_provider_status"), false);
  assert.equal(requiresHumanApproval("forget_preference"), false);
});

test("describePendingApproval builds short card text", () => {
  assert.equal(describePendingApproval("open_incident", {}), "open_incident");
  assert.match(
    describePendingApproval("resolver_incident", { id: "1", summary: "ok" }),
    /resolver_incident/,
  );
});
