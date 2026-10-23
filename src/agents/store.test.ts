import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidAlertStatusError,
  UnknownIncidentError,
  UnknownServiceError,
} from "../domain/errors.js";
import {
  createStoreFromPrimaryCatalog,
  listAlerts,
  openIncident,
  resolveIncident,
  summarizeStore,
} from "./store.js";

test("store do catálogo primário tem 5 serviços e 6 alertas, 3 em disparo e 3 resolvidos", () => {
  const store = createStoreFromPrimaryCatalog();
  const first = summarizeStore(store);
  const second = summarizeStore(createStoreFromPrimaryCatalog());

  assert.deepEqual(first, {
    services: 5,
    alerts: 6,
    firing: 3,
    resolved: 3,
  });
  assert.deepEqual(first, second);

  const checkoutAlerts = store.alerts.filter((alert) => alert.serviceSlug === "checkout");
  assert.ok(checkoutAlerts.length > 1);
});

test("listAlerts filtra firing e resolved e recusa situação inválida", () => {
  const store = createStoreFromPrimaryCatalog();
  const firing = listAlerts(store, "firing");
  const resolved = listAlerts(store, "resolved");

  assert.equal(firing.length, 3);
  assert.equal(resolved.length, 3);
  assert.ok(firing.every((alert) => alert.status === "firing"));
  assert.ok(resolved.every((alert) => alert.status === "resolved"));

  assert.throws(() => listAlerts(store, "all"), InvalidAlertStatusError);
  assert.deepEqual(summarizeStore(store), summarizeStore(createStoreFromPrimaryCatalog()));
});

test("openIncident e resolveIncident mudam só o incidente alvo", () => {
  const base = createStoreFromPrimaryCatalog();
  const opened = openIncident(base, {
    title: "Checkout instável",
    service: "checkout",
    severity: "critical",
  });

  assert.equal(opened.incident.status, "open");
  assert.equal(opened.incident.id, 1);
  assert.equal(opened.store.incidents.length, 1);

  const resolved = resolveIncident(opened.store, opened.incident.id);
  assert.equal(resolved.incident.status, "resolved");
  assert.equal(resolved.store.incidents.length, 1);

  const again = resolveIncident(resolved.store, opened.incident.id);
  assert.equal(again.incident.status, "resolved");
  assert.equal(again.store.incidents.length, 1);
});

test("serviço e incidente desconhecidos recusam sem alterar o store", () => {
  const store = createStoreFromPrimaryCatalog();
  const snapshot = structuredClone(store);

  assert.throws(
    () => openIncident(store, { title: "x", service: "billing", severity: "low" }),
    UnknownServiceError,
  );
  assert.throws(() => resolveIncident(store, 99), UnknownIncidentError);
  assert.deepEqual(store, snapshot);
});
