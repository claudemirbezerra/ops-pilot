import assert from "node:assert/strict";
import test from "node:test";

import { InvalidTeamDecisionError } from "../domain/errors.js";
import {
  ANALISTA_ALLOWLIST,
  ANALISTA_PROMPT,
  buildHandoffEvent,
  ceilingAnswer,
  EXECUTOR_ALLOWLIST,
  EXECUTOR_PROMPT,
  parseTeamDecision,
  PLANEJADOR_ALLOWLIST,
  PLANEJADOR_PROMPT,
  resolveTeamToolUse,
} from "./policy.js";

test("parseTeamDecision rejeita next ausente, fora da lista e brief em branco", () => {
  const cases = [
    {},
    { brief: "ler" },
    { next: "done", brief: "segredo-do-modelo" },
    { next: "analista", brief: "   " },
    { next: "analista", brief: "" },
  ];
  for (const raw of cases) {
    assert.throws(
      () => parseTeamDecision(raw),
      (error: unknown) => {
        assert.ok(error instanceof InvalidTeamDecisionError);
        assert.equal(error.message, "Não foi possível decidir o próximo papel.");
        assert.equal(error.message.includes("segredo"), false);
        return true;
      },
    );
  }
});

test("parseTeamDecision devolve o brief sem espaços nas pontas", () => {
  const decision = parseTeamDecision({
    next: "planejador",
    brief: "  montar o plano  ",
  });
  assert.equal(decision.next, "planejador");
  assert.equal(decision.brief, "montar o plano");
});

test("buildHandoffEvent sempre marca node team", () => {
  const event = buildHandoffEvent("analista", "Ler os alertas em disparo.");
  assert.deepEqual(event, {
    type: "handoff",
    next: "analista",
    brief: "Ler os alertas em disparo.",
    node: "team",
  });
});

test("ceilingAnswer usa o teto 8", () => {
  assert.equal(
    ceilingAnswer(),
    "Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).",
  );
});

test("prompts de papel contêm as frases obrigatórias", () => {
  assert.match(
    ANALISTA_PROMPT,
    /Relate apenas fatos\. Não proponha abertura, resolução, plano de passos nem próxima ação\./,
  );
  assert.match(PLANEJADOR_PROMPT, /Não chame ferramentas\./);
  assert.match(EXECUTOR_PROMPT, /Não contorne a aprovação humana\./);
});

test("allowlists são exatamente as três listas", () => {
  assert.deepEqual(
    [...ANALISTA_ALLOWLIST],
    [
      "list_alertas",
      "list_incidents",
      "consultar_runbook",
      "check_provider_status",
    ],
  );
  assert.deepEqual([...PLANEJADOR_ALLOWLIST], []);
  assert.deepEqual(
    [...EXECUTOR_ALLOWLIST],
    ["open_incident", "resolver_incident"],
  );
});

test("resolveTeamToolUse olha a allowlist antes da aprovação humana", () => {
  assert.deepEqual(resolveTeamToolUse("analista", "open_incident"), {
    kind: "deny",
  });
  assert.deepEqual(resolveTeamToolUse("analista", "resolver_incident"), {
    kind: "deny",
  });
  assert.deepEqual(resolveTeamToolUse("analista", "forget_preference"), {
    kind: "deny",
  });
  assert.deepEqual(resolveTeamToolUse("analista", "list_alertas"), {
    kind: "invoke",
  });
  assert.deepEqual(resolveTeamToolUse("planejador", "list_alertas"), {
    kind: "deny",
  });
  assert.deepEqual(resolveTeamToolUse("planejador", "open_incident"), {
    kind: "deny",
  });
  assert.deepEqual(resolveTeamToolUse("executor", "open_incident"), {
    kind: "approval",
  });
  assert.deepEqual(resolveTeamToolUse("executor", "resolver_incident"), {
    kind: "approval",
  });
  assert.deepEqual(resolveTeamToolUse("executor", "list_alertas"), {
    kind: "deny",
  });
});
