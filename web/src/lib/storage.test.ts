import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_API_BASE,
  getApiBaseUrl,
  isValidApiBase,
  normalizeApiBase,
  setApiBaseUrl,
} from "./storage.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("default api base", () => {
  assert.equal(getApiBaseUrl(memoryStorage()), DEFAULT_API_BASE);
});

test("normalize strips trailing slash", () => {
  assert.equal(normalizeApiBase("http://127.0.0.1:3000/"), "http://127.0.0.1:3000");
});

test("rejects empty/invalid", () => {
  assert.equal(isValidApiBase(""), false);
  assert.equal(isValidApiBase("not-a-url"), false);
  const bad = setApiBaseUrl("", memoryStorage());
  assert.equal(bad.ok, false);
});

test("saves valid https and reads back", () => {
  const storage = memoryStorage();
  const saved = setApiBaseUrl("https://ops.example.com/", storage);
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.equal(saved.value, "https://ops.example.com");
  }
  assert.equal(getApiBaseUrl(storage), "https://ops.example.com");
});
