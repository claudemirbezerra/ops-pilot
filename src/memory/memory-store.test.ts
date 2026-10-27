import assert from "node:assert/strict";
import { test } from "node:test";

import { InvalidMemoryInputError } from "../domain/errors.js";
import type { Embedder } from "../domain/types.js";
import { EMBEDDING_DIMS } from "./similarity.js";
import { SqliteMemoryStore } from "./memory-store.js";

function unitAt(index: number, dims = EMBEDDING_DIMS): Float32Array {
  const v = new Float32Array(dims);
  v[index] = 1;
  return v;
}

/** Deterministic fake: maps text prefixes to fixed unit vectors. */
function makeFakeEmbedder(
  map: Record<string, Float32Array>,
  fallback: Float32Array = unitAt(0),
): Embedder {
  return {
    async embed(text: string): Promise<Float32Array> {
      return map[text] ?? fallback;
    },
  };
}

function countMemories(store: SqliteMemoryStore): number {
  const row = store.database
    .prepare(`SELECT COUNT(*) AS c FROM memories`)
    .get() as { c: number };
  return row.c;
}

test("blank userId or fact throws and inserts nothing", async () => {
  const store = new SqliteMemoryStore(
    ":memory:",
    makeFakeEmbedder({ fact: unitAt(1) }),
  );
  await assert.rejects(
    () => store.remember("", "fact"),
    InvalidMemoryInputError,
  );
  await assert.rejects(
    () => store.remember("   ", "fact"),
    InvalidMemoryInputError,
  );
  await assert.rejects(
    () => store.remember("u1", ""),
    InvalidMemoryInputError,
  );
  await assert.rejects(
    () => store.remember("u1", "   "),
    InvalidMemoryInputError,
  );
  assert.equal(countMemories(store), 0);
});

test("remember returns MemoryRecord with stable fields", async () => {
  const store = new SqliteMemoryStore(
    ":memory:",
    makeFakeEmbedder({ "cluster azul": unitAt(2) }),
  );
  const record = await store.remember("plantonista-1", "cluster azul");
  assert.ok(record.id.length > 0);
  assert.equal(record.userId, "plantonista-1");
  assert.equal(record.fact, "cluster azul");
  assert.ok(Number.isInteger(record.createdAt));
  assert.equal(countMemories(store), 1);
});

test("remember with dot > 0.92 returns existing id and does not insert", async () => {
  const v = unitAt(3);
  const near = new Float32Array(EMBEDDING_DIMS);
  near.set(v);
  // Same direction → dot 1 > 0.92
  const store = new SqliteMemoryStore(
    ":memory:",
    makeFakeEmbedder({
      original: v,
      almost: v,
    }),
  );
  const first = await store.remember("u1", "original");
  const second = await store.remember("u1", "almost");
  assert.equal(second.id, first.id);
  assert.equal(countMemories(store), 1);
});

test("remember with dot <= 0.92 inserts a second row", async () => {
  const store = new SqliteMemoryStore(
    ":memory:",
    makeFakeEmbedder({
      a: unitAt(4),
      b: unitAt(5),
    }),
  );
  const first = await store.remember("u1", "a");
  const second = await store.remember("u1", "b");
  assert.notEqual(second.id, first.id);
  assert.equal(countMemories(store), 2);
});

test("facts for user-a never appear for user-b", async () => {
  const store = new SqliteMemoryStore(
    ":memory:",
    makeFakeEmbedder({
      "fato a": unitAt(6),
      "fato b": unitAt(7),
      query: unitAt(6),
    }),
  );
  await store.remember("user-a", "fato a");
  await store.remember("user-b", "fato b");
  const recalledA = await store.recall("user-a", "query");
  assert.ok(recalledA.every((r) => r.userId === "user-a"));
  assert.ok(recalledA.some((r) => r.fact === "fato a"));
  assert.ok(!recalledA.some((r) => r.fact === "fato b"));
  const rowsB = store.database
    .prepare(`SELECT fact FROM memories WHERE user_id = ?`)
    .all("user-b") as { fact: string }[];
  assert.deepEqual(
    rowsB.map((r) => r.fact),
    ["fato b"],
  );
});
