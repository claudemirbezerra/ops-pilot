import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCorsMiddleware,
  parseCorsAllowlist,
  resolveAllowedOrigin,
} from "./cors.js";

test("parseCorsAllowlist: empty/undefined → null (reflect mode)", () => {
  assert.equal(parseCorsAllowlist(undefined), null);
  assert.equal(parseCorsAllowlist(""), null);
  assert.equal(parseCorsAllowlist("  "), null);
});

test("parseCorsAllowlist: comma list", () => {
  const set = parseCorsAllowlist("http://a.example, http://b.example");
  assert.ok(set);
  assert.ok(set.has("http://a.example"));
  assert.ok(set.has("http://b.example"));
});

test("resolveAllowedOrigin reflects when no allowlist", () => {
  assert.equal(
    resolveAllowedOrigin("http://localhost:5173", null),
    "http://localhost:5173",
  );
});

test("resolveAllowedOrigin allowlist denies other origin", () => {
  const list = new Set(["http://a.example"]);
  assert.equal(resolveAllowedOrigin("http://b.example", list), null);
  assert.equal(resolveAllowedOrigin("http://a.example", list), "http://a.example");
});

test("createCorsMiddleware OPTIONS 204 with reflected Origin", () => {
  const mw = createCorsMiddleware({ originsEnv: "" });
  let status = 0;
  let ended = false;
  const headers = new Map<string, string>();
  const req = {
    method: "OPTIONS",
    header(name: string) {
      return name === "Origin" ? "http://localhost:5173" : undefined;
    },
  };
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      status = code;
      return this;
    },
    end() {
      ended = true;
    },
  };
  let nextCalled = false;
  mw(req as never, res as never, () => {
    nextCalled = true;
  });
  assert.equal(status, 204);
  assert.equal(ended, true);
  assert.equal(nextCalled, false);
  assert.equal(headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  assert.equal(headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
});
