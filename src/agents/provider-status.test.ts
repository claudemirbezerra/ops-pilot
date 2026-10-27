import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_STATUS_URLS,
  fetchProviderStatus,
  formatProviderStatusLine,
  statusPageBodySchema,
} from "./provider-status.js";

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}) {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    statusText: init.statusText ?? (status >= 400 ? "Error" : "OK"),
    headers: { "content-type": "application/json" },
  });
}

test("formatProviderStatusLine compacto", () => {
  assert.equal(
    formatProviderStatusLine({
      indicator: "none",
      description: "All Systems Operational",
    }),
    "none — All Systems Operational",
  );
});

test("statusPageBodySchema rejeita indicator/description vazios", () => {
  assert.equal(
    statusPageBodySchema.safeParse({
      status: { indicator: "", description: "x" },
    }).success,
    false,
  );
});

test("sucesso github com fake fetch", async () => {
  const urls: string[] = [];
  const fake: typeof fetch = async (input) => {
    urls.push(String(input));
    return jsonResponse({
      status: { indicator: "none", description: "All Systems Operational" },
    });
  };

  const result = await fetchProviderStatus("github", fake);
  assert.equal(result, "none — All Systems Operational");
  assert.deepEqual(urls, [PROVIDER_STATUS_URLS.github]);
});

test("sucesso cloudflare com fake fetch", async () => {
  const urls: string[] = [];
  const fake: typeof fetch = async (input) => {
    urls.push(String(input));
    return jsonResponse({
      status: { indicator: "minor", description: "Partial outage" },
    });
  };

  const result = await fetchProviderStatus("cloudflare", fake);
  assert.equal(result, "minor — Partial outage");
  assert.deepEqual(urls, [PROVIDER_STATUS_URLS.cloudflare]);
});

test("timeout AbortError esgota retry e devolve erro legível", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => {
    calls += 1;
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };

  const result = await fetchProviderStatus("github", fake);
  assert.equal(calls, 2);
  assert.match(result, /status page de github não respondeu/i);
  assert.match(result, /alertas internos/i);
});

test("HTTP 5xx depois 200 → sucesso na 2ª tentativa", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({ status: { indicator: "x", description: "y" } }, { status: 503 });
    }
    return jsonResponse({
      status: { indicator: "none", description: "All Systems Operational" },
    });
  };

  const result = await fetchProviderStatus("github", fake);
  assert.equal(calls, 2);
  assert.equal(result, "none — All Systems Operational");
});

test("body inválido → erro legível sem throw", async () => {
  const fake: typeof fetch = async () => jsonResponse({});
  const result = await fetchProviderStatus("github", fake);
  assert.match(result, /resposta inválida/i);
});

test("HTTP 4xx sem retry (uma chamada)", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => {
    calls += 1;
    return jsonResponse({ error: "nope" }, { status: 404, statusText: "Not Found" });
  };

  const result = await fetchProviderStatus("cloudflare", fake);
  assert.equal(calls, 1);
  assert.match(result, /status page de cloudflare respondeu 404/i);
});
