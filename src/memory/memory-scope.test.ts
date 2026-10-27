import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const outsideMemory = ["arena.ts", "bench.ts"];

test("arena e bench não conhecem MemoryStore nem memory-prompt", () => {
  for (const relative of outsideMemory) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.doesNotMatch(source, /SqliteMemoryStore/);
    assert.doesNotMatch(source, /MemoryStore/);
    assert.doesNotMatch(source, /memory-prompt/);
    assert.doesNotMatch(source, /userId/);
  }
});

test("arena e bench não importam learning reflector nem forget_preference", () => {
  for (const relative of outsideMemory) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.doesNotMatch(source, /scheduleLearning/);
    assert.doesNotMatch(source, /learning-extractor/);
    assert.doesNotMatch(source, /learning-reflector/);
    assert.doesNotMatch(source, /forget_preference/);
  }
});
