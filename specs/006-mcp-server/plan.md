# Implementation Plan: Servidor MCP OpsPilot

**Branch**: `006-mcp-server` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-mcp-server/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Expor o plantão OpsPilot como servidor MCP `opspilot` em stdio (`src/mcp/server.ts`, `@modelcontextprotocol/sdk`): tools `list_alerts`, `open_incident`, `resolve_incident` sobre o mesmo `OpsStore` e os mesmos schemas Zod das tools do agente (fonte única — extrair schemas compartilhados). Script `npm run mcp`. Regra crítica: zero escrita diagnóstica em stdout (`console.log` proibido); stderr só. Teste determina a listagem das três tools sem rede.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: `@modelcontextprotocol/sdk` (`McpServer`, `StdioServerTransport`), Zod (schemas compartilhados com `src/agents/tools.ts`), `OpsStore` existente

**Storage**: Mesmo OpsStore (SQLite via `OPSPILOT_DB` / default arquivo; `:memory:` / in-memory seedado nos testes)

**Testing**: `node:test` via `tsx`; factory do servidor + cliente MCP in-memory (ou transporte linkado) para `tools/list`; sem rede

**Target Platform**: Processo Node local spawnado por host MCP (Cursor / outros) via stdio

**Project Type**: Agente + web service; esta feature adiciona borda MCP stdio

**Performance Goals**: Listagem de tools utilizável em menos de 5s após o processo pronto (SC-001); respostas de tool no mesmo espírito das tools internas (JSON string / observação)

**Constraints**: stdout = protocolo apenas; sem `console.log` no server; schemas não duplicados; só 3 tools MCP neste escopo; app não lê `.env` (script npm pode usar `--env-file` como `dev`)

**Scale/Scope**: 1 entrypoint MCP + schemas compartilhados + script npm + 1 arquivo de teste; ~4–6 arquivos tocados

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | MCP em `src/mcp/` como borda (análogo a `src/http/`); chama `OpsStore` / handlers; sem Express no MCP |
| II | **Funções puras** | ✅ PASS | Schemas Zod e mapeamento de nomes são dados puros; I/O só no connect stdio e no store |
| III | **Validações na fronteira** | ✅ PASS | Zod na tool MCP (mesmos schemas) antes do domínio |
| IV | **Erros de domínio** | ✅ PASS | Mesmo padrão das tools internas: erro → observação/`isError` utilizável; não corrompe o canal stdio |
| V | **Teste é parte da tarefa** | ✅ PASS | FR-008 — teste valida `tools/list` das três tools |
| VI | **Segurança por padrão** | ✅ PASS | Sem secrets no repo; código não lê `.env`; env só via script/ambiente |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase) |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatia única: MCP + extract schemas + script + teste |

**Stack**: ✅ Node 22 + Zod + SQLite OpsStore; nova dep `@modelcontextprotocol/sdk` justificada pelo contrato MCP.

**Gate result: ALL PASS** — Complexity Tracking não necessário.

**Re-check pós Phase 1**: [data-model.md](./data-model.md) + [contracts/mcp-tools.md](./contracts/mcp-tools.md) mantêm borda MCP, schemas únicos e stdout limpo. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/006-mcp-server/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   └── mcp-tools.md        # Contrato servidor + 3 tools
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tools.ts                 # ← importa schemas compartilhados (sem redefinir)
│   └── ops-tool-schemas.ts      # ← NOVO: Zod + descrições das 3 tools (fonte de verdade)
├── mcp/
│   ├── server.ts                # ← NOVO: createOpsMcpServer + main stdio (sem console.log)
│   └── server.test.ts           # ← NOVO: tools/list das 3 tools
package.json                     # ← script "mcp"; dep @modelcontextprotocol/sdk
```

**Structure Decision**: Projeto único. Borda MCP em `src/mcp/` (espelha `src/http/`). Schemas extraídos para `src/agents/ops-tool-schemas.ts` para LangChain e MCP importarem a mesma definição. Factory `createOpsMcpServer(store)` testável sem spawn; `main` só conecta `StdioServerTransport`. Testes co-localizados `src/mcp/server.test.ts`.

## Complexity Tracking

> Nenhuma violação — seção vazia de propósito.
