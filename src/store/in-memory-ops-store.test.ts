import assert from "node:assert/strict";
import test from "node:test";

import { RunbookNotFoundError } from "../domain/errors.js";
import { InMemoryOpsStore } from "./in-memory-ops-store.js";
import { loadMercadinhoSeed, seedOpsStore } from "./seed-mercadinho.js";

test("seed idempotente ×2: 5 serviços, 6 alertas, 3 runbooks sem duplicar", () => {
  const store = new InMemoryOpsStore();
  const seed = loadMercadinhoSeed();
  seedOpsStore(store, seed);
  seedOpsStore(store, seed);

  assert.equal(store.listAlerts("all").length, 6);
  assert.equal(store.listAlerts("firing").length, 3);
  assert.equal(store.listAlerts("resolved").length, 3);
  assert.equal(store.getRunbook("payments").service, "payments");
  assert.equal(store.getRunbook("checkout").service, "checkout");
  assert.equal(store.getRunbook("auth").service, "auth");
});

test("listAlerts firing = 3 no Mercadinho", () => {
  const store = new InMemoryOpsStore();
  seedOpsStore(store);
  assert.equal(store.listAlerts("firing").length, 3);
});

test("getRunbook payments hit e notifications miss", () => {
  const store = new InMemoryOpsStore();
  seedOpsStore(store);

  assert.match(store.getRunbook("payments").content, /autorização/i);
  assert.throws(() => store.getRunbook("notifications"), RunbookNotFoundError);
});
