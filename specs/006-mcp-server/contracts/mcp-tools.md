# Contract: Servidor MCP `opspilot`

**Phase 1 output for** `specs/006-mcp-server/plan.md`

Borda externa: processo Node falando MCP JSON-RPC sobre **stdio**.  
Referências: [data-model.md](../data-model.md), [research.md](../research.md).

---

## Processo e identidade

| Item | Contrato |
|------|----------|
| Comando | `npm run mcp` → executa entrypoint `src/mcp/server.ts` |
| Transporte | stdio (stdin/stdout = protocolo) |
| Nome do servidor | `opspilot` |
| Dependência | `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport`) |
| Store | `createDefaultOpsStore()` em produção (respeita `OPSPILOT_DB`); injetável na factory para testes |

### Higiene de I/O (crítico)

| Canal | Uso permitido |
|-------|----------------|
| **stdout** | Somente mensagens do protocolo MCP |
| **stderr** | Diagnóstico, erros de bootstrap, `console.error` |
| Proibido | `console.log` (e qualquer escrita diagnóstica em stdout) em `src/mcp/**` |

---

## Factory (contrato interno testável)

```text
createOpsMcpServer(store: OpsStore) → McpServer
```

- Registra exatamente as três tools abaixo.
- Não chama `connect`.
- Não escreve em stdout/stderr por si só.

O `main` do entrypoint: cria store → `createOpsMcpServer` → `connect(StdioServerTransport)`.

---

## Tool: `list_alerts`

**Quando usar**: inventário de alertas de monitoramento por status.  
**Quando não usar**: incidentes formais (`open_incident` / `resolve_incident`).

### Schema de entrada (compartilhado com `list_alertas` do agente)

```typescript
z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe(
      'Filtro: "firing" (ativos), "resolved" (encerrados), "all" (todos). Default firing.',
    ),
})
```

### Comportamento

| Regra | Contrato |
|-------|----------|
| Efeito | `store.listAlerts(status)` (leitura) |
| Sucesso | `content` texto com JSON da lista |
| Erro de domínio | texto observável; store inalterado além do que a operação faria |
| Args inválidos | rejeitados na fronteira Zod |

---

## Tool: `open_incident`

**Quando usar**: registrar incidente formal após identificar problema.  
**Quando não usar**: só listar alertas.

### Schema de entrada (compartilhado com `open_incident` do agente)

```typescript
z.object({
  title: z.string().min(1).describe("Título curto do incidente"),
  service: z
    .string()
    .min(1)
    .describe("Slug do serviço afetado (ex.: payments, checkout, auth)"),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .describe("Severidade: low | medium | high | critical"),
})
```

### Comportamento

| Regra | Contrato |
|-------|----------|
| Efeito | `store.openIncident({ title, service, severity })` |
| Sucesso | JSON do `IncidentRecord` criado (`status: "open"`) |
| Erro de domínio | texto observável (mesma política das tools internas) |

---

## Tool: `resolve_incident`

**Quando usar**: fechar incidente após mitigação.  
**Quando não usar**: criar incidente novo.

### Schema de entrada (compartilhado com `resolver_incident` do agente)

```typescript
z.object({
  id: z.number().int().positive().describe("ID numérico do incidente"),
  summary: z
    .string()
    .min(1)
    .optional()
    .describe("Resumo opcional da resolução (o que foi feito)"),
})
```

### Comportamento

| Regra | Contrato |
|-------|----------|
| Efeito | `store.resolveIncident(id, summary?)` |
| Sucesso | JSON do `IncidentRecord` resolvido |
| Erro (id inexistente etc.) | texto observável; alinhado às tools internas |

---

## `tools/list` (contrato de descoberta)

Resposta MUST incluir as três tools com nomes:

1. `list_alerts`
2. `open_incident`
3. `resolve_incident`

Nesta feature, o conjunto anunciado é **exatamente** esses três (sem obrigação de expor `list_incidents`, `consultar_runbook`, `check_provider_status`).

---

## Fora de escopo

- Transporte HTTP / SSE / Streamable HTTP
- Auth MCP
- Demais tools do agente no MCP
- Renomear tools LangChain internas
