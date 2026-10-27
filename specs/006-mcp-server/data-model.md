# Data Model: Servidor MCP OpsPilot

**Phase 1 output for** `specs/006-mcp-server/plan.md`

Sem entidades de persistência novas. O MCP reutiliza o modelo operacional existente (`OpsStore`, alertas, incidentes). Este documento descreve as entidades de **borda MCP** e o vínculo com o store.

---

## McpServerIdentity

Identidade anunciada no handshake MCP.

| Campo | Tipo | Regras |
|-------|------|--------|
| `name` | string | obrigatório = `"opspilot"` |
| `version` | string | alinhada ao pacote ou literal estável (ex. `1.0.0`) |

---

## McpToolDescriptor

Tool anunciável via `tools/list`.

| Campo | Tipo | Regras |
|-------|------|--------|
| `name` | string | um de: `list_alerts`, `open_incident`, `resolve_incident` |
| `description` | string | o quê / quando usar (alinhada às tools do agente) |
| `inputSchema` | Zod object (fonte compartilhada) | mesma definição usada pelo agente |

### Catálogo desta feature (fechado)

| Nome MCP | Schema compartilhado | Efeito no OpsStore |
|----------|----------------------|--------------------|
| `list_alerts` | `listAlertsInputSchema` | leitura `listAlerts(status)` |
| `open_incident` | `openIncidentInputSchema` | escrita `openIncident(...)` |
| `resolve_incident` | `resolveIncidentInputSchema` | escrita `resolveIncident(id, summary?)` |

Nenhuma outra tool MCP é obrigatória neste escopo.

---

## Shared input shapes (fonte de verdade)

### listAlertsInput

| Campo | Tipo | Default | Validação |
|-------|------|---------|-----------|
| `status` | `"firing"` \| `"resolved"` \| `"all"` | `"firing"` | enum |

### openIncidentInput

| Campo | Tipo | Validação |
|-------|------|-----------|
| `title` | string | `min(1)` |
| `service` | string | `min(1)` (slug) |
| `severity` | `"low"` \| `"medium"` \| `"high"` \| `"critical"` | enum |

### resolveIncidentInput

| Campo | Tipo | Validação |
|-------|------|-----------|
| `id` | number | inteiro positivo |
| `summary` | string \| omitido | se presente, `min(1)` |

**Invariante**: estes shapes existem **uma vez** no código (módulo de schemas compartilhado); agente e MCP importam — não copiam.

---

## AlertRecord / IncidentRecord

Sem mudança de campos. Ver `src/domain/types.ts` e feature 004. O MCP serializa leituras/escritas como texto JSON (mesmo espírito das tools LangChain).

### IncidentStatus (transição relevante)

```text
(openIncident) → status "open"
(resolveIncident) → status "resolved" (+ resolvedAt / summary)
```

---

## McpToolResult

Resultado observável de uma chamada de tool MCP.

| Variante | Forma | Quando |
|----------|--------|--------|
| Sucesso | `content[{ type: "text", text }]` com JSON ou texto útil | store OK |
| Erro de domínio | texto legível (opcional `isError: true`) | `DomainError` / falha previsível |
| Entrada inválida | rejeição na validação Zod do SDK | antes do store; store intacto |

**Invariante**: falhas previsíveis não derrubam o transporte stdio nem escrevem diagnóstico em stdout.

---

## Relacionamentos

```text
Host MCP ──stdio──► McpServerIdentity (opspilot)
                         │
                         ▼ tools/list
                   McpToolDescriptor × 3
                         │
                         ▼ tools/call (+ Zod compartilhado)
                      OpsStore
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       AlertRecord  IncidentRecord  (sem schema novo)
```

Agente LangChain e MCP são duas bordas sobre o **mesmo** OpsStore e os **mesmos** schemas de entrada.
