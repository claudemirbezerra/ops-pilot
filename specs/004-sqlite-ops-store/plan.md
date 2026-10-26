# Implementation Plan: Persistência Real de Operações

**Branch**: `004-sqlite-ops-store` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-sqlite-ops-store/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Substituir o store JSON/`StoreHolder` de produção por `SqliteOpsStore` (`node:sqlite` / `DatabaseSync`), com schema idempotente de 4 tabelas, seed Mercadinho idempotente (incl. runbooks e `tier`), prepared statements only, e composição via `OPSPILOT_DB`. Introduzir o contrato `OpsStore` (evolução do `Store` funcional atual) com listagem de incidentes e consulta de runbook; expor tools `list_incidents` e `consultar_runbook`; alinhar as 5 tools em `src/agents/tools.ts` às 6 regras. In-memory permanece para bench e arena; testes de store/tools SQLite usam `:memory:`. Remover Sequelize/MySQL e o caminho `json-db` da composição de produção.

## Technical Context

**Language/Version**: Node.js 22 LTS (módulo `node:sqlite`), TypeScript ESM `strict: true`

**Primary Dependencies**: `node:sqlite` (`DatabaseSync`, `StatementSync`), Zod 4, LangChain tools existentes; **remover** `mysql` / `mysql2` / `sequelize` (fora da constitution v2.0.0)

**Storage**: SQLite arquivo (`OPSPILOT_DB`, default `./data/opspilot.db`); `:memory:` em testes automatizados do store/tools SQLite; `InMemoryOpsStore` (catálogo primário) para bench/arena

**Testing**: `node:test` via `tsx`; sem rede; CHECKs exercitados via INSERT inválido no `:memory:`

**Target Platform**: Node.js processo local (dev / arena / bench / HTTP)

**Project Type**: Agente + web service; esta feature é camada `store` + tools + seed

**Performance Goals**: Seed + queries de listagem em `:memory:` < 1s na suíte; sem meta de throughput multi-writer

**Constraints**: Prepared statements only; DDL/seed idempotentes; `data/` no `.gitignore`; camadas controller → service → model (store = persistência); validação Zod nas tools; constitution stack SQLite

**Scale/Scope**: 1 implementação SQLite nova; contrato `OpsStore`; 2 tools novas; revisão das 3 existentes; seed + cleanup MySQL/JSON; ~10–15 arquivos tocados; 4 tabelas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | `SqliteOpsStore` em `src/store/`; tools em `agents/` consomem `OpsStore`; HTTP/CLI não abrem `DatabaseSync` |
| II | **Funções puras** | ✅ PASS | Transições de domínio que já são puras podem permanecer; I/O fica no store SQLite / adapter in-memory |
| III | **Validações na fronteira** | ✅ PASS | Schemas Zod nas tools (enums + `.describe()`); CHECK no SQL como segunda linha |
| IV | **Erros de domínio** | ✅ PASS | Reusa `UnknownIncidentError` / `UnknownServiceError`; adiciona `RunbookNotFoundError`; tools devolvem observação |
| V | **Teste é parte da tarefa** | ✅ PASS | FR-013/FR-014 — `:memory:`, filtros, CHECKs, tools |
| VI | **Segurança por padrão** | ✅ PASS | Sem secrets; path via env; sem SQL concatenado (FR-007); `.env` não lido |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase) |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatia store + tools + seed + wire bootstrap; bench inalterado em estratégia |

**Stack**: ✅ SQLite via `node:sqlite`; sem Sequelize/MySQL.

**Gate result: ALL PASS** — Complexity Tracking não necessário.

**Re-check pós Phase 1**: contratos de tools + data-model mantêm store atrás da interface e tools no grafo. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/004-sqlite-ops-store/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── ops-store.md        # Contrato OpsStore
│   └── tools.md            # Contratos das 5 tools
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── types.ts                 # ← OpsStore, Runbook, ServiceTier, Incident.resolvedAt/summary
│   └── errors.ts                # ← RunbookNotFoundError
├── store/
│   ├── sqlite-ops-store.ts      # NOVO: SqliteOpsStore (DDL, prepared stmts, seed)
│   ├── sqlite-ops-store.test.ts # NOVO: :memory: seed/CRUD/filtros/CHECK
│   ├── in-memory-ops-store.ts   # NOVO: InMemoryOpsStore (bench + arena + parity)
│   └── seed-mercadinho.ts       # ← payload/seed OpsStore-agnostic + runbooks + tier
├── seed/
│   └── primary-catalog.json     # ← estender com tier + runbooks (ou seed-data dedicado)
├── agents/
│   ├── store.ts                 # ← adapta/reexporta OpsStore; remove json-db da produção
│   ├── store.test.ts            # ← passa a :memory: / InMemory conforme research
│   └── tools.ts                 # ← 5 tools; descrições 6 regras; .describe() + enums
├── react.ts / plan-and-execute / index.ts  # ← injeta SqliteOpsStore + seed
├── arena.ts                     # InMemoryOpsStore
├── bench.ts                     # InMemoryOpsStore (MUST)
└── seed.ts                      # ← seed SQLite (OPSPILOT_DB) em vez de json-db

.gitignore                       # ← data/
package.json                     # ← remover mysql, mysql2, sequelize
```

**Structure Decision**: Projeto único. Persistência nova em `src/store/sqlite-ops-store.ts`. Contrato e tipos de domínio em `domain/`. Tools canônicas em `src/agents/tools.ts`. Testes co-localizados (`src/**/*.test.ts`). Sem pasta `tests/` separada. Catálogo Mercadinho atual (5 slugs) é preservado; não renomear para catalog/inventory.

## Complexity Tracking

> Nenhuma violação — seção vazia de propósito.
