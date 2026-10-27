# Research: Servidor MCP OpsPilot

**Phase 0 output for** `specs/006-mcp-server/plan.md`

---

## Contexto

O plantão já opera alertas/incidentes via tools LangChain sobre `OpsStore`. A feature expõe o mesmo ciclo (`list` / `open` / `resolve`) a hosts MCP via stdio, com nome de servidor `opspilot`, schemas Zod únicos e stdout reservado ao protocolo. Esta fase fecha SDK/API, compartilhamento de schemas, nomes MCP vs agente, script npm, higiene stdio e estratégia de teste.

---

## Decisão 1: Pacote e API do SDK

**Decisão**: Dependência `@modelcontextprotocol/sdk` (pedido da spec). Usar a API high-level:

- `McpServer` de `@modelcontextprotocol/sdk/server/mcp.js`
- `StdioServerTransport` de `@modelcontextprotocol/sdk/server/stdio.js`
- Registro via `server.registerTool(name, { description, inputSchema }, handler)`
- Identidade: `{ name: "opspilot", version }` (version alinhada ao `package.json` ou literal estável `1.0.0`)

**Rationale**: Documentação oficial do typescript-sdk 1.x; Zod no `inputSchema` gera JSON Schema e valida argumentos; stdio é o transporte pedido (FR-001/FR-006).

**Alternatives considered**:
- Pacotes modulares novos (`@modelcontextprotocol/server`) — divergem do nome de pacote fixado na spec/Assumptions.
- `Server` low-level + `setRequestHandler` — mais boilerplate sem ganho neste escopo.
- HTTP/SSE — fora do escopo (Assumptions).

---

## Decisão 2: Fonte única de schemas Zod

**Decisão**: Extrair para `src/agents/ops-tool-schemas.ts` (nome ilustrativo; pode ser equivalente co-localizado) os três objetos Zod (+ descrições de tool reutilizáveis) hoje inline em `tools.ts`:

| Schema exportado | Usado por agente | Usado por MCP |
|------------------|------------------|---------------|
| `listAlertsInputSchema` | tool `list_alertas` | tool `list_alerts` |
| `openIncidentInputSchema` | tool `open_incident` | tool `open_incident` |
| `resolveIncidentInputSchema` | tool `resolver_incident` | tool `resolve_incident` |

`createOpsTools` passa a importar esses schemas em vez de redefini-los. O MCP `registerTool` usa os **mesmos** objetos Zod.

**Rationale**: FR-005 — proíbe cópia divergente; extract é o caminho mínimo para uma fonte de verdade.

**Alternatives considered**:
- MCP importa schemas “espelhados” — viola FR-005 ao longo do tempo.
- Gerar MCP a partir das instâncias LangChain `tool()` — acoplamento frágil (nomes PT, shape LangChain).
- Colocar schemas em `src/mcp/` e fazer o agente importar de lá — inverte a dependência (MCP é borda nova; domínio/agente já era dono das tools).

---

## Decisão 3: Nomes MCP vs nomes do agente

**Decisão**: Manter nomes internos do agente (`list_alertas`, `open_incident`, `resolver_incident`) inalterados. No MCP, anunciar exatamente:

- `list_alerts`
- `open_incident`
- `resolve_incident`

Mesmos handlers de domínio (`store.listAlerts` / `openIncident` / `resolveIncident`) e mesmos schemas; só o `name` MCP difere onde a spec pediu inglês.

**Rationale**: Spec Assumptions (“mapeamento 1:1 conceitual, mesmo que o nome interno use variante linguística”); evita breaking change no grafo/trace/prompts.

**Alternatives considered**:
- Renomear tools do agente para inglês — fora de escopo e quebra rastro/prompts.
- Expor no MCP os nomes PT — contradiz FR-003 / Input da spec.

---

## Decisão 4: Factory testável + entrypoint stdio

**Decisão**:

```text
createOpsMcpServer(store: OpsStore): McpServer
  → registra as 3 tools; sem connect; sem log

main() em server.ts (só quando executado como processo)
  → createDefaultOpsStore() (ou path via OPSPILOT_DB)
  → createOpsMcpServer(store)
  → await server.connect(new StdioServerTransport())
```

Diagnóstico de falha fatal no `main`: `console.error` / `process.stderr.write` — **nunca** `console.log`.

**Rationale**: FR-007/FR-008; permite teste sem spawn de processo; espelha padrão HTTP (app factory vs listen).

**Alternatives considered**:
- Lógica só no top-level do arquivo — dificulta testar listagem.
- Spawn `npm run mcp` em todo teste — mais lento e frágil no Windows.

---

## Decisão 5: Higiene stdout e script `npm run mcp`

**Decisão**:

- Proibir `console.log` (e qualquer print em stdout) em `src/mcp/**`.
- Script: `"mcp": "tsx src/mcp/server.ts"` como baseline do pedido.
- Se for desejável carregar `.env` para `OPSPILOT_DB` sem o código ler o arquivo: espelhar `dev` com  
  `"mcp": "node --env-file=.env --import tsx src/mcp/server.ts"`  
  (recomendado na implementação se o host MCP não injetar env). O código da app continua sem `dotenv` / sem ler `.env`.

**Rationale**: Constituição VI + padrão já usado em `dev`; FR-002.

**Alternatives considered**:
- `dotenv` dentro de `server.ts` — viola constituição.
- Só `tsx` sem env-file — ok se o operador exportar `OPSPILOT_DB` no host MCP.

---

## Decisão 6: Forma do resultado das tools MCP

**Decisão**: Handlers retornam `{ content: [{ type: "text", text: string }] }` onde `text` é o mesmo estilo das tools internas (`JSON.stringify` do record/lista, ou mensagem via `asObservation` / `DomainError`). Em falha de domínio previsível: texto de erro utilizável; opcionalmente `isError: true` sem derrubar o transporte. Validação Zod inválida: rejeitada pelo SDK antes do handler (store intacto).

**Rationale**: FR-010; alinhamento com `asObservation` em `tools.ts`.

**Alternatives considered**:
- Lançar exceção não tratada — pode quebrar a sessão MCP.
- structuredContent obrigatório — desnecessário para paridade com tools atuais (texto JSON).

---

## Decisão 7: Estratégia de teste da listagem

**Decisão**: Em `src/mcp/server.test.ts`:

1. `createInMemorySeededStore()` (ou `:memory:` SQLite seedado).
2. `createOpsMcpServer(store)`.
3. Conectar um `Client` MCP via transporte in-memory linkado (`InMemoryTransport` do SDK, se disponível na versão pinada) **ou** mecanismo equivalente suportado pela versão instalada.
4. `client.listTools()` e assertar que os nomes incluem exatamente / pelo menos `list_alerts`, `open_incident`, `resolve_incident`, e que o server name exposto na init é `opspilot` quando aplicável ao handshake.

Smoke opcional (não obrigatório nesta feature): `callTool` em `list_alerts` com store seedado.

**Rationale**: FR-008, SC-003; determinístico; sem rede; testa o servidor de verdade, não só um array paralelo.

**Alternatives considered**:
- Só assertar constante `MCP_TOOL_NAMES` exportada — não prova registro no `McpServer`.
- StdioClientTransport spawnando `tsx src/mcp/server.ts` — E2E útil no quickstart manual; pesado/flaky como único teste CI.

---

## Clarifications resolvidas

Não restam NEEDS CLARIFICATION no Technical Context. Defaults acima cobrem SDK path, extract de schemas, nomes EN no MCP, script/env e teste in-memory.
