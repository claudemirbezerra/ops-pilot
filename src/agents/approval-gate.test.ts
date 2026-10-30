import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TOOLS_REQUIRING_HUMAN_APPROVAL,
  HumanApprovalRequiredError,
  describePendingApproval,
  findApprovalError,
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
  assert.equal(describePendingApproval("open_incident", {}), "Abrir incidente");
  assert.match(
    describePendingApproval("open_incident", {
      title: "itens sumindo",
      service: "checkout",
      severity: "medium",
    }),
    /Abrir incidente:.*"itens sumindo".*checkout.*medium/,
  );
  assert.equal(
    describePendingApproval("resolver_incident", { id: 1, summary: "ok" }),
    "Resolver incidente #1: ok",
  );
});

test("findApprovalError recovers nested HumanApprovalRequiredError", () => {
  const inner = new HumanApprovalRequiredError({
    tool: "open_incident",
    args: { title: "t", service: "checkout", severity: "medium" },
  });
  const wrapped = new Error("ToolNode failed", { cause: inner });
  const found = findApprovalError(wrapped);
  assert.ok(found);
  assert.equal(found.tool, "open_incident");
  assert.equal(found.args.service, "checkout");
  assert.equal(findApprovalError(new Error("outro")), null);
});
