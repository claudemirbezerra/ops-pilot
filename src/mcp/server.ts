import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";

import {
  LIST_ALERTS_DESCRIPTION,
  OPEN_INCIDENT_DESCRIPTION,
  RESOLVE_INCIDENT_DESCRIPTION,
  listAlertsInputSchema,
  openIncidentInputSchema,
  resolveIncidentInputSchema,
} from "../agents/ops-tool-schemas.js";
import { createDefaultOpsStore } from "../agents/store.js";
import { DomainError } from "../domain/errors.js";
import type { OpsStore, Severity } from "../domain/types.js";

export const MCP_SERVER_NAME = "opspilot";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_TOOL_NAMES = [
  "list_alerts",
  "open_incident",
  "resolve_incident",
] as const;

function asObservation(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Erro desconhecido na ferramenta.";
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

/** Factory testável — sem connect e sem I/O de diagnóstico. */
export function createOpsMcpServer(store: OpsStore): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    "list_alerts",
    {
      description: LIST_ALERTS_DESCRIPTION,
      inputSchema: listAlertsInputSchema,
    },
    async ({ status }) => {
      try {
        return textResult(JSON.stringify(store.listAlerts(status)));
      } catch (error: unknown) {
        return textResult(asObservation(error), true);
      }
    },
  );

  server.registerTool(
    "open_incident",
    {
      description: OPEN_INCIDENT_DESCRIPTION,
      inputSchema: openIncidentInputSchema,
    },
    async ({ title, service, severity }) => {
      try {
        const incident = store.openIncident({
          title,
          service,
          severity: severity as Severity,
        });
        return textResult(JSON.stringify(incident));
      } catch (error: unknown) {
        return textResult(asObservation(error), true);
      }
    },
  );

  server.registerTool(
    "resolve_incident",
    {
      description: RESOLVE_INCIDENT_DESCRIPTION,
      inputSchema: resolveIncidentInputSchema,
    },
    async ({ id, summary }) => {
      try {
        const incident = store.resolveIncident(id, summary);
        return textResult(JSON.stringify(incident));
      } catch (error: unknown) {
        return textResult(asObservation(error), true);
      }
    },
  );

  return server;
}

export async function startOpsMcpServer(
  store: OpsStore = createDefaultOpsStore(),
): Promise<McpServer> {
  const server = createOpsMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

async function main(): Promise<void> {
  try {
    await startOpsMcpServer();
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Falha ao iniciar o servidor MCP.";
    console.error(`opspilot MCP: ${message}`);
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  void main();
}
