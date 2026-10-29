# Tasks: Grafo unificado de produção

**Input**: Design documents from `/specs/013-grafo-unificado/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — spec FR-014 / SC-006 / Independent Tests das US1–US4; constituição princípio V; quickstart sem rede.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueletos tipados do grafo e helpers puros, sem mudar o comportamento do `/chat` ainda

- [X] T001 [P] Create `src/agents/production-route.ts` exporting types `ProductionRoute`, `TraceNode`, stubs `isProductionRoute`, `stampTrace`, `resolveProductionStrategy`, and constant stub `ROUTER_PROMPT = ""` (throw `Error("not implemented")` on stub functions) per `data-model.md` / `contracts/production-graph.md`
- [X] T002 [P] Create `src/agents/production-graph.ts` exporting types `ProductionRouter`, `RouteDecision`, stub `createLlmRouter()` and stub `runProductionGraph(...)` that throw `Error("not implemented")` per `contracts/production-graph.md`
- [X] T003 [P] Create `src/agents/production-route.test.ts` and `src/agents/production-graph.test.ts` with `node:test` importing the stubs (`test.todo` or failing placeholders OK)

**Checkpoint**: Módulos novos existem; typecheck do restante intacto

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos de rastro, erro 502, helpers puros e `formatTrace` — bloqueia todas as user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Extend `TraceEvent` in `src/agents/strategy.ts` with optional `node?: TraceNode` on every variant and new variant `{ type: "route"; route: ProductionRoute; reason: string; override: boolean; node?: TraceNode }` (import or re-export `ProductionRoute` / `TraceNode` from `production-route.ts`; `node` remains optional so arena literals stay valid)
- [X] T005 [P] Add `InvalidRouteError` class in `src/domain/errors.ts` extending `DomainError` with default message exactly `Não foi possível decidir a rota.`
- [X] T006 [P] Implement in `src/agents/production-route.ts`: `PRODUCTION_ROUTES` as the three values `react` | `plan-and-execute` | `reflection`; `isProductionRoute(value: string): value is ProductionRoute` (exact match, no trim/case-fold); `OVERRIDE_REASON` exactly `Estratégia informada no pedido.`; `stampTrace(events, node)` returns shallow copies with `node` set; `buildRouteEvent({ route, reason, override })` returns `{ type: "route", route, reason, override, node: "router" }`
- [X] T007 [P] Implement `ROUTER_PROMPT` in `src/agents/production-route.ts` containing the three-row routing table from the spec (consulta/ação → `react`; sequência dependente → `plan-and-execute`; revisão/confiança → `reflection`) and no fourth route
- [X] T008 Implement `resolveProductionStrategy` in `src/agents/production-route.ts` per contracts: route `reflection` → `wrapWithReflection` of registry `react` with internal name `reflect:react` (ignore second wrap if `reflect === true`); route `react`/`plan-and-execute` + `reflect === true` → wrap that base with `reflect:react`/`reflect:plan-and-execute`; else return base; missing base → throw clear composition error (not `UnknownStrategyError`); use injected `critic` or omit until wrap needed
- [X] T009 Update `formatTrace` in `src/agents/trace.ts` to print a `[route]` branch (`route`, `reason`, `override`) so the new event is not omitted; leave other branches unchanged
- [X] T010 Replace stubs in `src/agents/production-route.test.ts` with cases: `isProductionRoute` accepts only the three exact strings; rejects `""`, `React`, `reflect:react`; `stampTrace` sets `node` on every event; `buildRouteEvent` always has `node: "router"`; `ROUTER_PROMPT` includes the three associations; `resolveProductionStrategy` for `reflection` wraps react once; `reflect: true` on `reflection` does not double-wrap; `reflect: true` on `react` wraps once with internal `reflect:react`
- [X] T011 Run `npm run typecheck` and `node --import tsx --test src/agents/production-route.test.ts` until green after T004–T010

**Checkpoint**: Tipos, erro e helpers puros prontos — US1 pode montar o grafo

---

## Phase 3: User Story 1 - Um único caminho para todo turno de chat (Priority: P1) 🎯 MVP

**Goal**: Todo turno não vazio percorre `context → router → exatamente uma estratégia → response`; a estratégia recebe o prompt de `buildContext`; mensagem vazia não entra no grafo; as outras duas estratégias não rodam.

**Independent Test**: `runProductionGraph` / `POST /chat` com router e registry fakes: só a rota escolhida chama `run`; `answer` é o da estratégia; prompt contém seções montadas; blank message não chama router nem strategy.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] In `src/agents/production-graph.test.ts`, add failing case: three fake strategies + router returning `plan-and-execute`; after `runProductionGraph`, only that fake's `run` was called once; `answer` equals that fake's answer; `react`/`reflection` call counts stay 0
- [X] T013 [P] [US1] In `src/agents/production-graph.test.ts`, add failing case: `sections` with non-empty summary/window/memory → strategy `run` receives `built.prompt` from `buildContext` (not the raw `message` alone)
- [X] T014 [P] [US1] In `src/http/server.test.ts`, adjust/add cases that omit `strategy`: inject `router` that returns `react` so existing fake-react expectations keep working (no OpenRouter); blank `message: "   "` still 200 with `EMPTY_INPUT_ANSWER` and `calls.length === 0` without invoking router

### Implementation for User Story 1

- [X] T015 [US1] Implement `runProductionGraph` in `src/agents/production-graph.ts` as a per-call `StateGraph` with nodes `context`, `router`, `react`, `plan-and-execute`, `reflection`, `response` and edges `START→context→router`, conditional edge from router to exactly one strategy node, then `→response→END`; `context` node calls `buildContext(sections, budgets)` and stores `prompt`/`built`; strategy nodes call `resolveProductionStrategy(...).run(prompt, options)` with `maxIterations`/`maxReflections`/`userId`/`memoryStore`; `response` must not call the model or rewrite `answer`
- [X] T016 [US1] Wire `runChat` in `src/services/chat-service.ts`: for non-blank messages, resolve budgets + sections as today then call `runProductionGraph` instead of `resolveChannelStrategy` + `strategy.run`; keep `Promise.race` timeout around the graph; return `built` into existing `contextBreakdown`; blank path still uses `buildEmptyInputResult` and skips the graph; accept optional `router?: ProductionRouter` (default `createLlmRouter` stub OK until US2)
- [X] T017 [US1] Thread optional `router` through `createApp` / `CreateAppOptions` in `src/http/server.ts` into `runChat`; default production path uses `createLlmRouter` when omitted
- [X] T018 [US1] Run US1 tests + `npm run typecheck` until green (inject router in every `/chat` test that omits `strategy`)

**Checkpoint**: MVP — caminho único no chat; uma estratégia por turno; blank fora do grafo

---

## Phase 4: User Story 2 - O roteador explica a rota (Priority: P1)

**Goal**: Sem `strategy`, o roteador devolve `{ route, reason }` estruturado; `ROUTER_PROMPT` tem a tabela; o rastro ganha evento `route` antes da estratégia (`override: false`); custo do turno soma `llmCalls`/`promptTokens` da decisão.

**Independent Test**: Router fake com `route`+`reason` fixos → primeiro evento do rastro é `route` com esses campos e `override: false`; métricas incluem `llmCalls`/`promptTokens` da decisão; `ROUTER_PROMPT` contém as três linhas.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [P] [US2] In `src/agents/production-graph.test.ts`, add failing case: router returns `{ route: "plan-and-execute", reason: "sequência", llmCalls: 1, promptTokens: 12 }` → trace starts with `{ type: "route", route: "plan-and-execute", reason: "sequência", override: false, node: "router" }` before strategy events; returned metrics `llmCalls`/`promptTokens` equal decision + strategy metrics
- [X] T020 [P] [US2] In `src/agents/production-route.test.ts`, assert `ROUTER_PROMPT` includes the three table associations (consulta/ação→`react`, sequência→`plan-and-execute`, revisão→`reflection`) and does not mention a fourth route name
- [X] T021 [P] [US2] In `src/http/server.test.ts`, add case: omit `strategy`, inject router with fixed decision → 200 `trace[0]` is the `route` event matching that decision with `override: false`

### Implementation for User Story 2

- [X] T022 [US2] Implement `createLlmRouter` in `src/agents/production-graph.ts`: Zod schema `{ route: enum of three, reason: string }`; `createModel().withStructuredOutput(schema, { includeRaw: true })`; system = `ROUTER_PROMPT`; user = current `message` only; return `llmCalls: 1`, `promptTokens: readPromptTokens(raw)`; empty trimmed `reason` or unexpected route → throw `InvalidRouteError` with message `Não foi possível decidir a rota.` (no model text leaked)
- [X] T023 [US2] In the `router` node of `src/agents/production-graph.ts` (non-override path): call `router.decide(message)`, append `buildRouteEvent({ route, reason, override: false })` before strategy events, accumulate decision metrics into turn totals; never call `decide` when override is set (US4 will wire override; until then keep non-override path complete)
- [X] T024 [US2] Run US2 tests + `npm run typecheck` until green

**Checkpoint**: Decisão automática visível no rastro e no custo

---

## Phase 5: User Story 3 - Cada evento do rastro diz a etapa (Priority: P1)

**Goal**: Todo evento do rastro do chat tem `node` em `context`|`router`|`react`|`plan-and-execute`|`reflection`|`response`; evento `route` usa `router`; eventos da estratégia usam a rota efetiva; `summarize` e answer de pedido vazio usam `response`.

**Independent Test**: Turno com fakes → every trace item has `node`; blank answer has `node: "response"` and no `route`; summarize event (when present) has `node: "response"`.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T025 [P] [US3] In `src/agents/production-graph.test.ts`, add failing case: strategy emits `thought`+`answer` → after graph, those events have `node` equal to the effective route; `route` event has `node: "router"`; no event lacks `node`
- [X] T026 [P] [US3] In `src/http/server.test.ts`, add/adjust blank-message case: 200 `trace` is a single `answer` with `node: "response"` and no `type: "route"`
- [X] T027 [P] [US3] In `src/http/server.test.ts` (or chat-service test), add case where summarizer fires: appended `summarize` event has `node: "response"`

### Implementation for User Story 3

- [X] T028 [US3] In strategy nodes of `src/agents/production-graph.ts`, `stampTrace` all events returned by `run` with the effective route name (`react`|`plan-and-execute`|`reflection`), never the internal `reflect:*` name
- [X] T029 [US3] In `src/services/chat-service.ts`, stamp blank-path `answer` with `node: "response"`; stamp any post-graph `summarize` events with `node: "response"` before returning
- [X] T030 [US3] Run US3 tests + `npm run typecheck` until green

**Checkpoint**: Rastro do chat sempre identifica a etapa

---

## Phase 6: User Story 4 - Estratégia informada é override no rastro (Priority: P1)

**Goal**: `strategy` opcional conhecida (`react`|`plan-and-execute`|`reflection`) força a rota sem chamar `decide`, com `override: true` e reason `Estratégia informada no pedido.`; nome fora da lista → 422; decisão inválida → 502; blank prevalece sobre `strategy` desconhecida (200, não 422).

**Independent Test**: Each of the three `strategy` values → only that fake runs, `decide` not called, route event override true + fixed reason; `strategy: "nope"` → 422; invalid router → 502; blank + `strategy: "nope"` → 200 empty answer.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T031 [P] [US4] In `src/agents/production-graph.test.ts`, add failing cases: override `react` / `plan-and-execute` / `reflection` → `decide` never called; route event has `override: true`, `reason` exactly `Estratégia informada no pedido.`, `node: "router"`; only named strategy runs; metrics router portion is 0
- [X] T032 [P] [US4] In `src/agents/production-graph.test.ts`, add failing case: router throws / returns empty reason → `InvalidRouteError`, no strategy `run`, no successful `route` event
- [X] T033 [P] [US4] In `src/http/server.test.ts`, add cases: `strategy` each of the three routes → 200 override route event; `strategy: ""` / `"React"` / `"reflect:react"` with non-blank message → 422 citing the name, no router/strategy; invalid injected router → 502 `{ message: "Não foi possível decidir a rota." }` without `answer`/`trace`/`metrics`
- [X] T034 [P] [US4] In `src/http/server.test.ts`, change blank+`strategy: "nope"` expectation from 422 to 200 empty answer (no route, no strategy calls); keep `strategy: "nope"` with non-blank message and unknown `conversationId` as 422 (not 404)

### Implementation for User Story 4

- [X] T035 [US4] In `src/services/chat-service.ts`, reorder: blank message first (skip strategy validation, skip graph); else if `strategy` present and `!isProductionRoute(strategy)` throw `UnknownStrategyError` **before** `lastMessages` / graph; else pass `override: strategy` into `runProductionGraph`; omit `strategy` → no override (router decides); stop defaulting absent strategy to `"react"`
- [X] T036 [US4] In the `router` node of `src/agents/production-graph.ts`, when override is set: do not call `decide`; append `buildRouteEvent({ route: override, reason: OVERRIDE_REASON, override: true })`; router metrics stay 0
- [X] T037 [US4] Map `InvalidRouteError` to HTTP 502 `{ message: error.message }` in `src/http/server.ts` (distinct from 400/422/504); ensure `reflect: true` still wraps only when effective route is `react` or `plan-and-execute`, and route `reflection` does not double-wrap
- [X] T038 [US4] Run US4 tests + `npm run typecheck` until green

**Checkpoint**: Override, 422 e 502 alinhados ao contrato HTTP

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação quickstart, higiene e suíte completa

- [X] T039 [P] Walk `specs/013-grafo-unificado/quickstart.md` commands (`typecheck`, `npm test`, focused production-*.test.ts) and fix doc drift if any
- [X] T040 Ensure `channelStrategies` in `src/agents/index.ts` still has only `react` and `plan-and-execute` (no `reflection` key); arena/bench still call strategies directly without the production graph; no `.env` file reads introduced
- [X] T041 Final `npm run typecheck` && `npm test` green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP path + chat wire
- **US2 (Phase 4)**: After US1 graph exists (same modules; needs router node)
- **US3 (Phase 5)**: After US2 (route event present so `node` can be asserted on full traces)
- **US4 (Phase 6)**: After US3 — override/422/502 on the stamped path
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP
- **US2 (P1)**: After US1 `runProductionGraph` skeleton
- **US3 (P1)**: After US2 route event exists
- **US4 (P1)**: After US3 stamping — override + HTTP edges

### Within Each User Story

- Tests FIRST (fail before implementation)
- Implement → typecheck/story tests green
- Commit after each task or logical group

### Parallel Opportunities

- T001 || T002 || T003 (Setup)
- T005 || T006 || T007 (Foundational helpers/error; T004 before T006 if types land first — T004 then parallel T005/T007)
- T012 || T013 || T014 (US1 tests)
- T019 || T020 || T021 (US2 tests)
- T025 || T026 || T027 (US3 tests)
- T031 || T032 || T033 || T034 (US4 tests)
- T039 || T040 (Polish)
- Implementation tasks on `production-graph.ts` / `chat-service.ts` / `server.ts` are **same-file** → sequential within a story

---

## Parallel Example: User Story 4

```bash
# Author US4 tests in parallel (coordinate hunks if same file):
Task: "Override cases in src/agents/production-graph.test.ts"
Task: "Invalid router case in src/agents/production-graph.test.ts"
Task: "HTTP 422/502/override cases in src/http/server.test.ts"
Task: "Blank + unknown strategy → 200 in src/http/server.test.ts"

# Then implement sequentially:
Task: "Reorder blank/422 in src/services/chat-service.ts"
Task: "Override branch in production-graph router node"
Task: "Map InvalidRouteError → 502 in src/http/server.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (types, helpers, `InvalidRouteError`)
3. Phase 3 US1 (graph + `runChat` wire + injected router)
4. **STOP and VALIDATE**: one strategy per turn; blank skips graph; `/chat` tests inject router
5. Then US2 → US3 → US4 for route event, `node`, override/502

### Incremental Delivery

1. Setup + Foundational → types/helpers ready
2. US1 → unified path (MVP)
3. US2 → explained route + cost
4. US3 → `node` on every chat trace event
5. US4 → override + 422/502 + blank precedence
6. Polish → quickstart + full suite

### Parallel Team Strategy

Limited parallelism: one owner for `production-graph.ts` + `chat-service.ts` + `server.ts`; second person can draft tests in `production-*.test.ts` / `server.test.ts` ahead of implementation.

---

## Notes

- [P] = different files or non-conflicting test authoring; same-file impl tasks are sequential
- Spec strings to quote verbatim: override reason `Estratégia informada no pedido.`; 502 message `Não foi possível decidir a rota.`; routes exactly `react` | `plan-and-execute` | `reflection`
- Constraints: `node` optional on shared `TraceEvent`; absent `strategy` must NOT default to `react`; blank message wins over unknown `strategy` (200 not 422); unknown strategy still wins over unknown `conversationId` (422 not 404)
- Out of scope: arena/bench graph, fourth strategy, reading `.env` files, changing context budgets
- Suggested MVP: Phases 1–3 (US1)
