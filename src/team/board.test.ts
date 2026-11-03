import assert from "node:assert/strict";
import test from "node:test";

import { applyRoleUpdate, emptyBoard, renderBoard } from "./board.js";

test("analista acumula achados e não mexe no plano", () => {
  let board = emptyBoard("pedido original");
  board = applyRoleUpdate(board, {
    role: "planejador",
    plan: ["plano antigo"],
  });
  board = applyRoleUpdate(board, {
    role: "analista",
    findings: "alerta checkout",
    plan: ["não deve entrar"],
  });
  board = applyRoleUpdate(board, {
    role: "analista",
    findings: "runbook do checkout",
    incident: "não deve entrar",
  });

  assert.equal(board.findings, "alerta checkout\nrunbook do checkout");
  assert.deepEqual(board.plan, ["plano antigo"]);
  assert.equal(board.incident, "");
  assert.equal(board.request, "pedido original");
});

test("planejador substitui só o plano", () => {
  let board = emptyBoard("pedido original");
  board = applyRoleUpdate(board, {
    role: "analista",
    findings: "fato",
  });
  board = applyRoleUpdate(board, {
    role: "planejador",
    plan: ["Ler alertas", "Abrir incidente"],
    findings: "não deve entrar",
  });

  assert.equal(board.findings, "fato");
  assert.deepEqual(board.plan, ["Ler alertas", "Abrir incidente"]);
  assert.equal(board.incident, "");
  assert.equal(board.request, "pedido original");
});

test("executor acumula só o incidente", () => {
  let board = emptyBoard("pedido original");
  board = applyRoleUpdate(board, {
    role: "analista",
    findings: "fato",
  });
  board = applyRoleUpdate(board, {
    role: "planejador",
    plan: ["passo"],
  });
  board = applyRoleUpdate(board, {
    role: "executor",
    incident: "pedido de abertura",
    findings: "não deve entrar",
    plan: ["não deve entrar"],
  });
  board = applyRoleUpdate(board, {
    role: "executor",
    incident: "ainda sem gravação",
  });

  assert.equal(board.findings, "fato");
  assert.deepEqual(board.plan, ["passo"]);
  assert.equal(board.incident, "pedido de abertura\nainda sem gravação");
  assert.equal(board.request, "pedido original");
});

test("renderBoard inclui as quatro chaves nesta ordem", () => {
  const board = applyRoleUpdate(emptyBoard("pedido original"), {
    role: "analista",
    findings: "fato",
  });
  const text = renderBoard(board);
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed), [
    "request",
    "findings",
    "plan",
    "incident",
  ]);
  assert.equal(parsed.request, "pedido original");
  assert.equal(parsed.findings, "fato");
  assert.deepEqual(parsed.plan, []);
  assert.equal(parsed.incident, "");
});
