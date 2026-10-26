import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidAlertStatusError,
  UnknownIncidentError,
  UnknownServiceError,
} from "../domain/errors.js";
import { createInMemorySeededStore, summarizeOpsStore } from "./store.js";

test("store in-memory seedado tem 6 alertas, 3 em disparo e 3 resolvidos", () => {
  const store = createInMemorySeededStore();
  const first = summarizeOpsStore(store);
  const second = summarizeOpsStore(createInMemorySeededStore());

  assert.deepEqual(first, {
    services: 5,
    alerts: 6,
    firing: 3,
    resolved: 3,
  });
  assert.deepEqual(first, second);

  const checkoutAlerts = store
    .listAlerts("all")
    .filter((alert) => alert.serviceSlug === "checkout");
  assert.ok(checkoutAlerts.length > 1);
});

test("listAlerts filtra firing e resolved e recusa situação inválida", () => {
  const store = createInMemorySeededStore();
  const firing = store.listAlerts("firing");
  const resolved = store.listAlerts("resolved");

  assert.equal(firing.length, 3);
  assert.equal(resolved.length, 3);
  assert.ok(firing.every((alert) => alert.status === "firing"));
  assert.ok(resolved.every((alert) => alert.status === "resolved"));

  assert.throws(
    () => store.listAlerts("bogus" as "firing"),
    InvalidAlertStatusError,
  );
});

test("openIncident e resolveIncident mudam só o incidente alvo", () => {
  const store = createInMemorySeededStore();
  const opened = store.openIncident({
    title: "Checkout instável",
    service: "checkout",
    severity: "critical",
  });

  assert.equal(opened.status, "open");
  assert.equal(opened.id, 1);
  assert.equal(store.listIncidents("all").length, 1);

  const resolved = store.resolveIncident(opened.id, "mitigado");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.summary, "mitigado");
  assert.ok(resolved.resolvedAt !== null);
  assert.equal(store.listIncidents("all").length, 1);

  const again = store.resolveIncident(opened.id);
  assert.equal(again.status, "resolved");
  assert.equal(store.listIncidents("all").length, 1);
});

test("serviço e incidente desconhecidos recusam sem alterar o store", () => {
  const store = createInMemorySeededStore();
  const before = store.listIncidents("all").length;

  assert.throws(
    () => store.openIncident({ title: "x", service: "billing", severity: "low" }),
    UnknownServiceError,
  );
  assert.throws(() => store.resolveIncident(99), UnknownIncidentError);
  assert.equal(store.listIncidents("all").length, before);
});
