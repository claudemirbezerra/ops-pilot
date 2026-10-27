# Quickstart: Servidor MCP OpsPilot

**Phase 1 output for** `specs/006-mcp-server/plan.md`

Guia de validação end-to-end. Sem código de implementação completo.

Referências: [data-model.md](./data-model.md), [contracts/mcp-tools.md](./contracts/mcp-tools.md).

---

## Pré-requisitos

- Node.js 22+
- `npm install` na raiz (inclui `@modelcontextprotocol/sdk` após a implementação)
- Opcional: `OPSPILOT_DB` no ambiente (ou `.env` carregado só pelo script npm, nunca pelo código da app)

---

## 1. Validação automatizada — obrigatória

```bash
npm test
npm run typecheck
```

**Esperado**: verdes, incluindo `src/mcp/server.test.ts`:

| # | Caso | Esperado |
|---|------|----------|
| 1 | Factory + `tools/list` | nomes `list_alerts`, `open_incident`, `resolve_incident` presentes |
| 2 | Identidade | servidor `opspilot` no handshake / metadata aplicável |
| 3 | Isolamento | store in-memory (ou `:memory:`); sem rede |

Regressão: tools LangChain existentes continuam verdes após extract dos schemas compartilhados.

---

## 2. Smoke do processo stdio — obrigatória (manual rápida)

```bash
npm run mcp
```

**Esperado**:

- Processo fica à espera de JSON-RPC em stdio (não “imprime hello” em stdout).
- Nenhum banner/`console.log` poluindo stdout.
- Encerrar com Ctrl+C (ou fechar stdin) sem exigir interação extra.

Diagnóstico de falha de bootstrap (ex. DB inacessível), se houver, aparece em **stderr**.

---

## 3. Smoke com host MCP (opcional)

Configurar o host (ex. Cursor) para spawnar:

```text
command: npm
args: ["run", "mcp"]
cwd: <raiz do ops-pilot>
```

**Esperado**: host lista as três tools; chamada a `list_alerts` devolve JSON coerente com o store configurado.

---

## 4. Checagem de higiene stdout (opcional mas recomendada)

- Busca estática: nenhum `console.log` em `src/mcp/`.
- Ou: capturar stdout ao subir o processo sem cliente — deve permanecer vazio/só frames MCP se houver handshake; sem texto livre de log.

---

## Critérios de pronto (ligação à spec)

| SC | Como validar neste quickstart |
|----|-------------------------------|
| SC-001 | §1 caso 1–2 + §3 (descoberta em menos de 5s) |
| SC-002 | chamada `open_incident` / `resolve_incident` refletida no mesmo OpsStore (teste ou smoke) |
| SC-003 | §1 completa, sem rede |
| SC-004 | §2 / §4 — stdout limpo |
| SC-005 | §2 — `npm run mcp` único comando |
