import assert from "node:assert/strict";
import test from "node:test";

import type { Embedder } from "../domain/types.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { EMBEDDING_DIMS } from "../memory/similarity.js";
import { seedOpsStore } from "../store/seed-mercadinho.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { PROVIDER_STATUS_URLS } from "./provider-status.js";
import { createOpsTools } from "./tools.js";

function unitAt(index: number): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMS);
  vector[index] = 1;
  return vector;
}

type AnyTool = {
  name: string;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
};

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function toolsOnMemory(fetchImpl?: typeof fetch) {
  const store = new SqliteOpsStore(":memory:");
  seedOpsStore(store);
  const created = createOpsTools(store, fetchImpl ? { fetchImpl } : {});
  return { store, tools: created.tools as unknown as AnyTool[] };
}

function findTool(tools: AnyTool[], name: string): AnyTool {
  const found = tools.find((tool) => tool.name === name);
  assert.ok(found, `tool ${name} missing`);
  return found;
}

test("list_incidents default open + filtros resolved/all", async () => {
  const { store, tools } = toolsOnMemory();
  store.openIncident({
    title: "A",
    service: "checkout",
    severity: "high",
  });
  const open = store.openIncident({
    title: "B",
    service: "payments",
    severity: "medium",
  });
  store.resolveIncident(open.id, "ok");

  const list = findTool(tools, "list_incidents");
  const defaultOpen = JSON.parse(String(await list.invoke({}))) as unknown[];
  assert.equal(defaultOpen.length, 1);

  const resolved = JSON.parse(
    String(await list.invoke({ status: "resolved" })),
  ) as unknown[];
  assert.equal(resolved.length, 1);

  const all = JSON.parse(String(await list.invoke({ status: "all" }))) as unknown[];
  assert.equal(all.length, 2);
});

test("consultar_runbook hit payments e miss notifications", async () => {
  const { tools } = toolsOnMemory();
  const runbook = findTool(tools, "consultar_runbook");

  const hit = String(await runbook.invoke({ service: "payments" }));
  assert.match(hit, /autorização/i);

  const miss = String(await runbook.invoke({ service: "notifications" }));
  assert.match(miss, /Runbook não encontrado/i);
});

test("list_alertas / open_incident / resolver_incident em :memory:", async () => {
  const { tools } = toolsOnMemory();
  const listAlertas = findTool(tools, "list_alertas");
  const open = findTool(tools, "open_incident");
  const resolve = findTool(tools, "resolver_incident");

  const firing = JSON.parse(
    String(await listAlertas.invoke({ status: "firing" })),
  ) as unknown[];
  assert.equal(firing.length, 3);

  const incident = JSON.parse(
    String(
      await open.invoke({
        title: "Pagamentos lentos",
        service: "payments",
        severity: "high",
      }),
    ),
  ) as { id: number; status: string };
  assert.equal(incident.status, "open");

  const resolved = JSON.parse(
    String(await resolve.invoke({ id: incident.id, summary: "ok" })),
  ) as { status: string; summary: string | null };
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.summary, "ok");
});

test("createOpsTools registra 7 tools incluindo forget_preference", () => {
  const { tools } = toolsOnMemory();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "list_alertas",
      "open_incident",
      "resolver_incident",
      "list_incidents",
      "consultar_runbook",
      "check_provider_status",
      "forget_preference",
    ],
  );
});

test("forget_preference hit removes matching fact", async () => {
  const ops = new SqliteOpsStore(":memory:");
  seedOpsStore(ops);
  const embedder: Embedder = {
    async embed(text: string) {
      if (text.includes("cluster") || text.includes("azul")) {
        return unitAt(1);
      }
      return unitAt(0);
    },
  };
  const memory = new SqliteMemoryStore(":memory:", embedder);
  const record = await memory.remember("plantonista-1", "prefiro o cluster azul");
  const { tools } = createOpsTools(ops, {
    memoryStore: memory,
    userId: "plantonista-1",
  });
  const forget = findTool(tools as unknown as AnyTool[], "forget_preference");
  const raw = String(
    await forget.invoke({ description: "cluster azul preferido" }),
  );
  const result = JSON.parse(raw) as {
    forgotten: boolean;
    id?: string;
    fact?: string;
  };
  assert.equal(result.forgotten, true);
  assert.equal(result.id, record.id);
  assert.equal(result.fact, record.fact);
  assert.equal((await memory.recall("plantonista-1", "cluster azul")).length, 0);
});

test("forget_preference miss leaves store intact", async () => {
  const ops = new SqliteOpsStore(":memory:");
  seedOpsStore(ops);
  const missEmbedder: Embedder = {
    async embed(text: string) {
      return text === "fato ortogonal" ? unitAt(0) : unitAt(5);
    },
  };
  const memory = new SqliteMemoryStore(":memory:", missEmbedder);
  await memory.remember("u1", "fato ortogonal");
  const { tools } = createOpsTools(ops, {
    memoryStore: memory,
    userId: "u1",
  });
  const forget = findTool(tools as unknown as AnyTool[], "forget_preference");
  const result = JSON.parse(
    String(await forget.invoke({ description: "algo sem relação" })),
  ) as { forgotten: boolean };
  assert.equal(result.forgotten, false);
  assert.equal((await memory.recall("u1", "fato ortogonal")).length, 1);
});

test("forget_preference without userId returns domain observation", async () => {
  const ops = new SqliteOpsStore(":memory:");
  seedOpsStore(ops);
  const memory = new SqliteMemoryStore(":memory:", {
    async embed() {
      return unitAt(0);
    },
  });
  await memory.remember("u1", "fato");
  const { tools } = createOpsTools(ops, { memoryStore: memory });
  const forget = findTool(tools as unknown as AnyTool[], "forget_preference");
  const observation = String(
    await forget.invoke({ description: "fato" }),
  );
  assert.match(observation, /userId/i);
  assert.equal((await memory.recall("u1", "fato")).length, 1);
});

test("check_provider_status sucesso default github via fetchImpl", async () => {
  const urls: string[] = [];
  const fake: typeof fetch = async (input) => {
    urls.push(String(input));
    return jsonResponse({
      status: { indicator: "none", description: "All Systems Operational" },
    });
  };
  const { tools } = toolsOnMemory(fake);
  const check = findTool(tools, "check_provider_status");
  const result = String(await check.invoke({}));
  assert.equal(result, "none — All Systems Operational");
  assert.deepEqual(urls, [PROVIDER_STATUS_URLS.github]);
});

test("check_provider_status erro legível sem rejeitar (body inválido)", async () => {
  const fake: typeof fetch = async () => jsonResponse({});
  const { tools } = toolsOnMemory(fake);
  const check = findTool(tools, "check_provider_status");
  const result = String(await check.invoke({ provider: "github" }));
  assert.match(result, /resposta inválida/i);
});
