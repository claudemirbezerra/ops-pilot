import assert from "node:assert/strict";
import { test } from "node:test";

import { getDefaultEmbedder } from "./embeddings.js";
import { SqliteMemoryStore } from "./memory-store.js";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 2),
  );
}

function shareCommonWord(a: string, b: string): boolean {
  const left = tokenize(a);
  for (const token of tokenize(b)) {
    if (left.has(token)) {
      return true;
    }
  }
  return false;
}

test(
  "recall finds semantically related fact without shared words",
  { timeout: 300_000 },
  async () => {
    // Pair tuned so all-MiniLM-L6-v2 scores >= 0.3 while sharing no content tokens
    // (length > 2). Same intent as the quickstart payments/blue example.
    const fact = "o datacenter financeiro tem tinta azul";
    const query = "qual cor do ambiente de payments?";
    assert.equal(
      shareCommonWord(fact, query),
      false,
      "ensaio exige fato e consulta sem palavra em comum",
    );

    const store = new SqliteMemoryStore(":memory:", getDefaultEmbedder());
    await store.remember("semantic-user", fact);
    const recalled = await store.recall("semantic-user", query);
    assert.ok(recalled.length >= 1);
    assert.ok(recalled.some((r) => r.fact === fact));
    const hit = recalled.find((r) => r.fact === fact)!;
    assert.ok(hit.score >= 0.3, `score ${hit.score} should be >= 0.3`);
  },
);
