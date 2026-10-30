import assert from "node:assert/strict";
import { test } from "node:test";

import { formatApprovalAnswer } from "./approval-answer.js";

test("formatApprovalAnswer deny keeps description", () => {
  const answer = formatApprovalAnswer(
    "deny",
    { tool: "open_incident", description: "Abrir incidente: checkout" },
    "",
  );
  assert.match(answer, /Negado/);
  assert.match(answer, /checkout/);
});

test("formatApprovalAnswer open_incident parses JSON observation", () => {
  const answer = formatApprovalAnswer(
    "approve",
    { tool: "open_incident", description: "Abrir incidente" },
    JSON.stringify({
      id: 12,
      title: "Itens sumindo",
      serviceSlug: "checkout",
      severity: "medium",
      status: "open",
    }),
  );
  assert.match(answer, /Incidente \*\*#12\*\* aberto com sucesso/);
  assert.match(answer, /checkout/);
  assert.match(answer, /Itens sumindo/);
});

test("formatApprovalAnswer resolver_incident parses JSON observation", () => {
  const answer = formatApprovalAnswer(
    "approve",
    { tool: "resolver_incident", description: "Resolver #1" },
    JSON.stringify({ id: 1, status: "resolved", summary: "mitigado" }),
  );
  assert.match(answer, /Incidente \*\*#1\*\* resolvido: mitigado/);
});

test("formatApprovalAnswer falls back when observation is not JSON", () => {
  const answer = formatApprovalAnswer(
    "approve",
    { tool: "open_incident", description: "Abrir incidente" },
    "serviço desconhecido",
  );
  assert.match(answer, /Aprovado/);
  assert.match(answer, /serviço desconhecido/);
});
