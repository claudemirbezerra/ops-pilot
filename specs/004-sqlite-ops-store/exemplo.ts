import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SqliteOpsStore } from "../store/sqlite-ops-store.ts";

const store = new SqliteOpsStore();
const server = new McpServer({
    name: "OpsPilot",
    version: "1.0.0",
});

server.registerTool("open_incident", {
    description: "Abre um novo incidente no OpsPilot. Use quando o usuário relatar um problema em produção ou pedir para registrar/abrir um incidente.",
    inputSchema: {
        title: z.string().describe("O título do incidente. Exemplo: 'Serviço X está inoperante'"),
        service_id: z.string().describe("O ID do serviço afetado (ex: checkout, paymeents)"),
        severity: z.string().describe("A severidade do incidente"),
    },
}, async ({ title, service_id, severity }) => ({
    content: [{ type: "text", text: JSON.stringify(store.openIncident(title, service_id, severity)) }],
}));
// list_alerts e resolve_incident seguem o mesmo padrão

await server.connect(new StdioServerTransport());
console.log("OpsPilot MCP server is running on stdin/stdout"); //stderr, nunca stdout

