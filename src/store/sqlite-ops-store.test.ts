import assert from "node:assert/strict";
import test from "node:test";

import { RunbookNotFoundError } from "../domain/errors.js";
import { loadMercadinhoSeed, seedOpsStore } from "./seed-mercadinho.js";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

function memoryStore(): SqliteOpsStore {
  const store = new SqliteOpsStore(":memory:");
  seedOpsStore(store);
  return store;
}

test("seed idempotente ×2: 5 services, 6 alerts (3/3), 3 runbooks sem duplicar PKs", () => {
  const store = new SqliteOpsStore(":memory:");
  const seed = loadMercadinhoSeed();
  seedOpsStore(store, seed);
  seedOpsStore(store, seed);

  assert.equal(store.listAlerts("all").length, 6);
  assert.equal(store.listAlerts("firing").length, 3);
  assert.equal(store.listAlerts("resolved").length, 3);
  assert.equal(store.getRunbook("checkout").service, "checkout");
  assert.equal(store.getRunbook("payments").service, "payments");
  assert.equal(store.getRunbook("auth").service, "auth");
});

test("open → list open → resolve → list resolved com resolvedAt/summary", () => {
  const store = memoryStore();
  const opened = store.openIncident({
    title: "Checkout instável",
    service: "checkout",
    severity: "critical",
  });

  assert.equal(opened.status, "open");
  assert.equal(store.listIncidents("open").length, 1);
  assert.equal(store.listIncidents("resolved").length, 0);

  const resolved = store.resolveIncident(opened.id, "rollback aplicado");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.summary, "rollback aplicado");
  assert.ok(typeof resolved.resolvedAt === "number");
  assert.equal(store.listIncidents("open").length, 0);
  assert.equal(store.listIncidents("resolved").length, 1);
  assert.equal(store.listIncidents("all").length, 1);
});

test("listAlerts filtra firing / resolved / all no Mercadinho", () => {
  const store = memoryStore();
  assert.equal(store.listAlerts("firing").length, 3);
  assert.equal(store.listAlerts("resolved").length, 3);
  assert.equal(store.listAlerts("all").length, 6);
});

test("CHECK rejeita tier / severity / status inválidos", () => {
  const store = memoryStore();
  const db = store.database;

  assert.throws(() => {
    db.prepare(
      `INSERT INTO services (slug, name, description, tier) VALUES (?, ?, ?, ?)`,
    ).run("x", "X", "desc", "invalid-tier");
  });

  assert.throws(() => {
    db.prepare(
      `INSERT INTO alerts (service_slug, title, detail, severity, status) VALUES (?, ?, ?, ?, ?)`,
    ).run("checkout", "bad", "d", "ultra", "firing");
  });

  assert.throws(() => {
    db.prepare(
      `INSERT INTO incidents (title, service_slug, severity, status, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run("t", "checkout", "critical", "mitigated", Date.now());
  });
});

test("getRunbook miss lança RunbookNotFoundError", () => {
  const store = memoryStore();
  assert.throws(() => store.getRunbook("notifications"), RunbookNotFoundError);
});
