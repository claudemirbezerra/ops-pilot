import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createInMemorySeededStore } from "../agents/store.js";
import {
  MCP_SERVER_NAME,
  MCP_TOOL_NAMES,
  createOpsMcpServer,
} from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

async function connectClientToServer(store = createInMemorySeededStore()) {
  const server = createOpsMcpServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "opspilot-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, store };
}

test("tools/list includes list_alerts, open_incident, resolve_incident", async () => {
  const { client } = await connectClientToServer();
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [...MCP_TOOL_NAMES].sort());
});

test("server identity name is opspilot", async () => {
  const { client } = await connectClientToServer();
  const version = client.getServerVersion();
  assert.ok(version);
  assert.equal(version.name, MCP_SERVER_NAME);
});

test("list_alerts returns JSON consistent with seeded store", async () => {
  const store = createInMemorySeededStore();
  const { client } = await connectClientToServer(store);
  const expected = store.listAlerts("firing");
  const result = await client.callTool({
    name: "list_alerts",
    arguments: { status: "firing" },
  });
  assert.equal(result.isError, undefined);
  const text = (result.content as { type: string; text: string }[])[0]?.text;
  assert.equal(text, JSON.stringify(expected));
});

test("open_incident creates open incident in the same store", async () => {
  const store = createInMemorySeededStore();
  const before = store.listIncidents("open").length;
  const { client } = await connectClientToServer(store);
  const result = await client.callTool({
    name: "open_incident",
    arguments: {
      title: "Checkout lento",
      service: "checkout",
      severity: "high",
    },
  });
  assert.equal(result.isError, undefined);
  const text = (result.content as { type: string; text: string }[])[0]?.text;
  assert.ok(text);
  const incident = JSON.parse(text) as { status: string; title: string };
  assert.equal(incident.status, "open");
  assert.equal(incident.title, "Checkout lento");
  assert.equal(store.listIncidents("open").length, before + 1);
});

test("resolve_incident resolves incident in the same store", async () => {
  const store = createInMemorySeededStore();
  const opened = store.openIncident({
    title: "Auth 5xx",
    service: "auth",
    severity: "critical",
  });
  const { client } = await connectClientToServer(store);
  const result = await client.callTool({
    name: "resolve_incident",
    arguments: { id: opened.id, summary: "Rollback feito" },
  });
  assert.equal(result.isError, undefined);
  const text = (result.content as { type: string; text: string }[])[0]?.text;
  assert.ok(text);
  const incident = JSON.parse(text) as { status: string; id: number };
  assert.equal(incident.status, "resolved");
  assert.equal(incident.id, opened.id);
  assert.equal(
    store.listIncidents("open").some((item) => item.id === opened.id),
    false,
  );
});

test("invalid open_incident args are rejected without corrupting store", async () => {
  const store = createInMemorySeededStore();
  const before = store.listIncidents("all").length;
  const { client } = await connectClientToServer(store);
  const result = await client.callTool({
    name: "open_incident",
    arguments: { title: "", service: "checkout", severity: "high" },
  });
  assert.equal(result.isError, true);
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  assert.match(text, /validation|Invalid arguments|title/i);
  assert.equal(store.listIncidents("all").length, before);
});

test("src/mcp has no console.log (stdout hygiene)", () => {
  const serverSource = readFileSync(join(here, "server.ts"), "utf8");
  assert.doesNotMatch(serverSource, /console\.log\s*\(/);
});

test("package.json scripts.mcp points at MCP entrypoint", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.ok(pkg.scripts.mcp);
  assert.match(pkg.scripts.mcp, /src\/mcp\/server\.ts/);
});
