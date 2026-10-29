# Implementation Plan: Resiliência de modelo

**Branch**: `014-resiliencia-modelo` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-resiliencia-modelo/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A fábrica em `src/agents/model.ts` compõe o cliente OpenRouter com retry só no principal e, se `OPENROUTER_MODEL_FALLBACK` estiver definido, um único reserva via `withFallbacks`. Turnos bem-sucedidos expõem `metrics.modelUsed` e, na troca, um evento de rastro `fallback`. Esgotados principal e reserva (ou só o principal sem reserva), sobe `ModelUnavailableError` → HTTP 503 — sem resposta operacional falsa em 200.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Já no projeto — `@langchain/core` (`Runnable.withRetry`, `Runnable.withFallbacks`), `@langchain/openai` (`ChatOpenAI`), Express, Zod. Sem dependência npm nova.

**Storage**: N/A (sem tabela nova; rastro/métricas só na resposta JSON)

**Testing**: `node:test` via `tsx`. Fábrica com runnables fakes (principal falha / reserva ok / ambos falham). HTTP 503 sem rede. `npm run typecheck` e `npm test` verdes.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente LangGraph + borda HTTP já existente

**Performance Goals**: Fallback só após esgotar retries do principal; no caminho saudável, zero invocação do reserva. Timeout de request do modelo permanece `MODEL_REQUEST_TIMEOUT_MS` (60s) por tentativa.

**Constraints**: Não ler arquivo `.env`. Um único reserva. Não inventar reserva implícito. Não empilhar retry do SDK (`maxRetries`) **e** `withRetry` no mesmo principal. Arena/bench herdam a fábrica se usarem `createModel` / `createCountingModel`, sem caminho paralelo. Mensagem vazia continua sem consultar modelo.

**Scale/Scope**: Um processo, um turno por request. Touches: `model.ts` (+ testes), `strategy` (TraceEvent + Metrics), `trace` (`formatTrace`), `errors` + `server` (503), estratégias que hoje engolem falha de modelo como 200, wire de métricas em `chat-service` / grafo se necessário.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP só traduz `ModelUnavailableError` → 503. Fábrica e estratégias não conhecem Express. |
| II | **Funções puras** | ✅ PASS | Parse de env (`resolveFallbackModel`), montagem de evento `fallback` e carimbo de `modelUsed` em helpers puros testáveis; IO só no invoke do runnable. |
| III | **Validações na fronteira** | ✅ PASS | Env lida na fábrica (não é body HTTP). Body `/chat` inalterado (Zod). |
| IV | **Erros de domínio** | ✅ PASS | Nova `ModelUnavailableError`; borda mapeia 503. `MissingModelConfigError` permanece para config ausente. |
| V | **Teste é parte da tarefa** | ✅ PASS | Unitários da composição + HTTP 503 com fake; typecheck/test verdes. |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo; 503 não ecoa stack; não ler `.env` no código. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: env+fábrica → tipos de rastro/métrica → erro/503 → estratégias param de engolir falha → testes. |

**Stack**: ✅ Node 22, TypeScript ESM strict, Zod, `node:test` via tsx, Express, SQLite inalterado, LangChain/LangGraph sobre OpenRouter. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio. Nenhum `NEEDS CLARIFICATION` restante.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/model-env.md](./contracts/model-env.md), [contracts/model-factory.md](./contracts/model-factory.md), [contracts/chat-http.md](./contracts/chat-http.md) e [quickstart.md](./quickstart.md) mantêm composição na fábrica, observabilidade no rastro/métricas, 503 como erro de domínio e ausência de soft-200 para falha total de modelo. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/014-resiliencia-modelo/
├── plan.md                      # Este arquivo
├── research.md                  # Phase 0
├── data-model.md                # Phase 1
├── quickstart.md                # Phase 1
├── contracts/
│   ├── model-env.md
│   ├── model-factory.md
│   └── chat-http.md
└── tasks.md                     # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── model.ts                 # ← OPENROUTER_MODEL_FALLBACK; withRetry + withFallbacks; session modelUsed/fallback
│   ├── model.test.ts            # NOVO: fakes de invoke; fallback; sem reserva; ambos falham
│   ├── strategy.ts              # ← TraceEvent "fallback"; Metrics.modelUsed
│   ├── trace.ts                 # ← formatTrace para fallback
│   ├── react.ts                 # ← não engolir ModelUnavailableError como 200
│   ├── plan-and-execute.ts      # ← idem
│   ├── reflection.ts            # ← alinhar detecção de indisponibilidade se ainda usar MODEL_UNAVAILABLE_ANSWER
│   └── production-graph.ts      # ← propagar modelUsed / evento se o wire agregar métricas do turno
├── domain/
│   └── errors.ts                # ← ModelUnavailableError
├── services/
│   └── chat-service.ts          # ← garantir metrics.modelUsed no 200 quando houve consulta
└── http/
    ├── server.ts                # ← 503 ModelUnavailableError
    └── server.test.ts           # ← 503 sem answer; 200 com modelUsed / fallback
```

**Structure Decision**: Projeto único. Toda resiliência nasce em `src/agents/model.ts` (não criar `models.ts` paralelo). Consumidores (`createModel`, `createCountingModel`, e helpers de structured output do roteador) passam a receber o runnable composto. Observabilidade via estado de sessão da fábrica (getters), carimbado em `Metrics` / `TraceEvent` pelos callers — sem Express na fábrica.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
