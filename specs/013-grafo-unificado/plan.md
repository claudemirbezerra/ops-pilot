# Implementation Plan: Grafo unificado de produção

**Branch**: `013-grafo-unificado` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-grafo-unificado/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Todo turno de chat não vazio passa por um `StateGraph` único: `context` → `router` → exatamente uma de `react`, `plan-and-execute` ou `reflection` → `response`. O roteador de produção usa `withStructuredOutput` (`route`, `reason`) e uma tabela fixa no prompt. O rastro ganha o evento `route` e o campo opcional `node`, obrigatório na resposta do chat. `strategy` conhecida no `POST /chat` é override: não chama o roteador e o evento marca `override: true`. Decisão inválida vira `InvalidRouteError` e HTTP 502. Mensagem vazia não valida estratégia.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Já no projeto — `@langchain/langgraph` (`StateGraph`, aresta condicional), `@langchain/openai` (`withStructuredOutput` + `{ includeRaw: true }`), Zod 4, `buildContext`, `wrapWithReflection`, `createModel`, `readPromptTokens`. Sem dependência npm nova.

**Storage**: N/A (sem tabela nova; rastro só na resposta JSON)

**Testing**: `node:test` via `tsx`. Roteador, registry e crítico injetáveis. Sem OpenRouter na suíte. `npm run typecheck` e `npm test` verdes.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente LangGraph + borda HTTP já existente

**Performance Goals**: No máximo uma consulta extra (o roteador) quando `strategy` vem ausente; zero consultas de roteador no override. O grafo é uma passagem linear de quatro etapas, sem ciclo entre estratégias.

**Constraints**: Não ler arquivo `.env`. Não voltar ao default `react` quando `strategy` falta. Motivo de override exatamente `Estratégia informada no pedido.` Mensagem 502 exatamente `Não foi possível decidir a rota.` Timeout de 180s cobre o grafo. Arena e bench fora deste caminho. `node` não pode ser obrigatório no tipo compartilhado com a arena.

**Scale/Scope**: Um processo, um turno por request. Touches: tipo de rastro, erro de domínio, grafo novo, wire em `runChat` / `createApp`, testes de HTTP que hoje assumem default ReAct.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP só traduz `InvalidRouteError` → 502. `runChat` faz I/O de conversa/memória e chama o grafo. O grafo não conhece Express. Stores não são lidas dentro dos nós. |
| II | **Funções puras** | ✅ PASS | Carimbo, evento `route`, allowlist, `resolveProductionStrategy` e o texto da tabela ficam em funções puras. O nó `context` só chama `buildContext`. `decide` é porta injetável. |
| III | **Validações na fronteira** | ✅ PASS | Body continua Zod. Nome de `strategy` é checado no serviço (422) antes do grafo. Decisão do modelo é checada no roteador antes da estratégia. |
| IV | **Erros de domínio** | ✅ PASS | `InvalidRouteError` nova classe. 422 / 404 / 504 / 503 existentes permanecem. A borda mapeia 502. |
| V | **Teste é parte da tarefa** | ✅ PASS | Puros + grafo com fakes + HTTP, sem rede. Typecheck e suíte verdes. |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo. 502 não ecoa o texto do modelo. Deny list das ferramentas não muda. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: tipo e helpers puros → porta do roteador → grafo → wire do chat → testes de HTTP. Arena intocada. |

**Stack**: ✅ Node 22, TypeScript ESM strict, Zod, `node:test` via tsx, Express, SQLite inalterado, LangChain/LangGraph sobre OpenRouter. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio. Nenhum `NEEDS CLARIFICATION` restante.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/production-graph.md](./contracts/production-graph.md), [contracts/chat-http.md](./contracts/chat-http.md) e [quickstart.md](./quickstart.md) mantêm I/O no serviço, decisão pura fora do Express, 502 como erro de domínio e arena fora do grafo. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/013-grafo-unificado/
├── plan.md                      # Este arquivo
├── research.md                  # Phase 0
├── data-model.md                # Phase 1
├── quickstart.md                # Phase 1
├── contracts/
│   ├── production-graph.md
│   └── chat-http.md
└── tasks.md                     # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── production-route.ts       # NOVO: rotas, stampTrace, resolveProductionStrategy, ROUTER_PROMPT
│   ├── production-route.test.ts  # NOVO: puros, sem grafo e sem rede
│   ├── production-graph.ts       # NOVO: StateGraph, createLlmRouter, runProductionGraph
│   ├── production-graph.test.ts  # NOVO: fakes de router e estratégias
│   ├── strategy.ts               # ← TraceEvent ganha route + node opcional
│   ├── trace.ts                  # ← formatTrace imprime route
│   ├── index.ts                  # channelStrategies inalterado (sem chave reflection)
│   ├── reflection.ts             # reutilizado (wrap sobre ReAct ou sobre a base)
│   └── critic.ts                 # reutilizado; injeção já existente
├── domain/
│   └── errors.ts                 # ← InvalidRouteError
├── services/
│   └── chat-service.ts           # ← ordem blank / 422 / grafo; carimba summarize e answer vazio
└── http/
    ├── server.ts                 # ← router opcional; 502
    └── server.test.ts            # ← default deixa de ser react implícito; 502; blank não é 422
```

**Structure Decision**: Projeto único. O grafo mora em `src/agents/` ao lado das estratégias que ele chama, sem absorver o `StateGraph` interno de Plan-and-Execute nem o ReAct prebuilt. Helpers puros ficam em `production-route.ts` para a suíte não precisar compilar o grafo. `runChat` permanece o único wiring de produção: deixa de chamar `resolveChannelStrategy` e passa a chamar `runProductionGraph`. `resolveChannelStrategy` pode permanecer para não quebrar imports, mas o chat não o usa mais como entrada do turno.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
