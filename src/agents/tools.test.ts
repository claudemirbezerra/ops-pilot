import assert from "node:assert/strict";
import test from "node:test";

import { seedOpsStore } from "../store/seed-mercadinho.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { createOpsTools } from "./tools.js";

type AnyTool = {
  name: string;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
};

function toolsOnMemory() {
  const store = new SqliteOpsStore(":memory:");
  seedOpsStore(store);
  const created = createOpsTools(store);
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

test("createOpsTools registra 5 tools", () => {
  const { tools } = toolsOnMemory();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "list_alertas",
      "open_incident",
      "resolver_incident",
      "list_incidents",
      "consultar_runbook",
    ],
  );
});
