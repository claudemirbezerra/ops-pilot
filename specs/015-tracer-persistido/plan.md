# Implementation Plan: Tracer persistido e logs JSON

**Branch**: `015-tracer-persistido` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-tracer-persistido/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Cada `POST /chat` ganha um `requestId` (UUID) no corpo e no header `X-Request-Id`. O turno é gravado no SQLite operacional (`OPSPILOT_DB`) em `requests` (métricas) + `trace_events` (nó + payload JSON), **antes** do 200 quando o turno completa. Em paralelo, `src/obs/logger.ts` emite uma linha JSON por evento **só com metadados**. `GET /request/:id` devolve o registro + eventos ordenados por `seq` (404 se ausente).

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Já no projeto — Express, Zod, `node:sqlite` (`DatabaseSync`), `node:crypto` (`randomUUID`). Sem dependência npm nova.

**Storage**: SQLite via `OPSPILOT_DB` (default `./data/opspilot.db`); testes `:memory:`. Tabelas novas `requests` e `trace_events` no mesmo arquivo que conversas/ops/memória (conexões `DatabaseSync` separadas, padrão já usado).

**Testing**: `node:test` via `tsx`. Store em `:memory:`; logger com writer injetável; HTTP via `createApp` + registry fake. `npm run typecheck` e `npm test` verdes.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente LangGraph + borda HTTP já existente

**Performance Goals**: Persistência síncrona no caminho do turno (mesmo padrão das outras gravações SQLite); log linha a linha sem bloquear além de um `write`. Sem requisito de throughput alto (um processo, plantão).

**Constraints**: Não ler `.env`. Logger **não** serializa payload completo. Camadas: HTTP não acessa SQL; store não conhece Express. Erro de request ausente = classe de domínio → 404. Arena/bench fora do escopo de persistir tracer.

**Scale/Scope**: Um processo; um `requestId` por invocação HTTP de `/chat`. Touches: store novo, logger `src/obs/`, wiring em `server` + `chat-service` (ou borda), erro de domínio, testes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | Controller HTTP gera id, seta header, chama service/store; store SQL só no model/store; logger sem Express. |
| II | **Funções puras** | ✅ PASS | Serialização de metadados de log, mapeamento TraceEvent→linha/registro e ordenação são helpers puros testáveis; IO isolado no store/logger writer. |
| III | **Validações na fronteira** | ✅ PASS | Body `/chat` Zod inalterado; param `:id` de `GET /request/:id` validado na borda (não vazio). |
| IV | **Erros de domínio** | ✅ PASS | `RequestNotFoundError` (nome final no data-model) → 404 na borda. |
| V | **Teste é parte da tarefa** | ✅ PASS | Store, logger, HTTP `/chat` + GET; typecheck/test verdes. |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo; log sem payloads; não ler `.env`. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: schema/store → logger → wire `/chat` → GET → testes. |

**Stack**: ✅ Node 22, TypeScript ESM strict, Zod, `node:test` via tsx, Express, SQLite `node:sqlite`, LangChain/LangGraph inalterado nesta feature. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio. Nenhum `NEEDS CLARIFICATION` restante.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/request-store.md](./contracts/request-store.md), [contracts/logger.md](./contracts/logger.md), [contracts/chat-http.md](./contracts/chat-http.md), [contracts/get-request-http.md](./contracts/get-request-http.md) e [quickstart.md](./quickstart.md) mantêm camadas, Zod na borda, erro de domínio 404, log só metadados e SQLite/`OPSPILOT_DB`. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/015-tracer-persistido/
├── plan.md                      # Este arquivo
├── research.md                  # Phase 0
├── data-model.md                # Phase 1
├── quickstart.md                # Phase 1
├── contracts/
│   ├── request-store.md
│   ├── logger.md
│   ├── chat-http.md
│   └── get-request-http.md
└── tasks.md                     # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── obs/
│   ├── logger.ts                # NOVO: uma linha JSON por evento (só metadados); writer injetável
│   └── logger.test.ts           # NOVO
├── store/
│   ├── sqlite-request-store.ts  # NOVO: requests + trace_events (OPSPILOT_DB / :memory:)
│   └── sqlite-request-store.test.ts
├── domain/
│   ├── errors.ts                # ← RequestNotFoundError
│   └── types.ts                 # ← RequestStore / tipos de registro (se centralizar)
├── services/
│   └── chat-service.ts          # ← opcional: receber requestId / hook de persistência se o wire ficar no service
└── http/
    ├── server.ts                # ← gerar requestId; header X-Request-Id; persistir; GET /request/:id
    └── server.test.ts           # ← requestId corpo+header; GET 200/404; log metadados
```

**Structure Decision**: Projeto único. Novo store dedicado (`SqliteRequestStore`) no padrão `SqliteConversationStore` — **não** misturar na interface `OpsStore` (alertas/incidentes). Logger em `src/obs/` conforme spec. Correlação e persistência na borda HTTP + store; service continua dono do turno de chat.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
