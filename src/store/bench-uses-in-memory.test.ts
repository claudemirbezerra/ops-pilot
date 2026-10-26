import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("bench.ts constrói InMemoryOpsStore via createInMemorySeededStore", () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "bench.ts");
  const source = readFileSync(path, "utf8");
  assert.match(source, /createInMemorySeededStore/);
  assert.doesNotMatch(source, /SqliteOpsStore/);
  assert.doesNotMatch(source, /OPSPILOT_DB/);
});
