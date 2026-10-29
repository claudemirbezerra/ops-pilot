# Tasks: Resiliência de modelo

**Input**: Design documents from `/specs/014-resiliencia-modelo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — Independent Tests das US1–US4; constituição princípio V; contratos `model-factory.md` / `chat-http.md`; quickstart sem rede.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de testes da fábrica; sem mudar comportamento de produção ainda

- [ ] T001 [P] Create `src/agents/model.test.ts` with `node:test` importing `createModel` / helpers to be added (`test.todo` or failing placeholders OK) per `contracts/model-factory.md`
- [ ] T002 Confirm no new npm dependency is required (`@langchain/core` already exposes `withRetry` / `withFallbacks`); note in `src/agents/model.ts` header comment only if useful — do not add packages to `package.json`

**Checkpoint**: Arquivo de teste da fábrica existe; typecheck do restante intacto

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Erro de domínio, tipos de rastro/métrica, parse de env e `formatTrace` — bloqueia todas as user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 [P] Add `ModelUnavailableError` class in `src/domain/errors.ts` extending `DomainError` with default message exactly `Modelo indisponível.`
- [ ] T004 [P] Extend `TraceEvent` in `src/agents/strategy.ts` with variant `{ type: "fallback"; from: string; to: string; node?: TraceNode }` and extend `Metrics` with optional `modelUsed?: string` (omit when no model call; never empty string) per `data-model.md`
- [ ] T005 [P] Update `formatTrace` in `src/agents/trace.ts` to print a `[fallback]` branch (`from`, `to`) so the new event is not omitted; leave other branches unchanged
- [ ] T006 Extend `ModelEnv` in `src/agents/model.ts` with optional `OPENROUTER_MODEL_FALLBACK?: string` and implement pure `resolveFallbackModel(env): string | undefined` — `undefined` / `""` / whitespace-only → `undefined`; otherwise trimmed string (may equal primary) per `contracts/model-env.md`
- [ ] T007 Replace placeholders in `src/agents/model.test.ts` with cases for `resolveFallbackModel`: absent → `undefined`; `""` / `"   "` → `undefined`; `"openai/gpt-4o-mini"` → that id; run `node --import tsx --test src/agents/model.test.ts` until green for these cases
- [ ] T008 Run `npm run typecheck` until green after T003–T007 (call sites that construct `Metrics` / `TraceEvent` literals remain valid with optional fields)

**Checkpoint**: Tipos, erro, parse de env e formatTrace prontos — US1 pode compor resiliência

---

## Phase 3: User Story 1 - Continuar o turno quando o modelo principal falha (Priority: P1) 🎯 MVP

**Goal**: Principal com `withRetry`; se esgotar e houver reserva, `withFallbacks` tenta o reserva e o turno obtém resposta sem reenvio.

**Independent Test**: Fakes em `model.test.ts`: principal falha sempre + reserva ok → sucesso e reserva invocado; principal ok → reserva não invocado; retries no principal antes do reserva.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] In `src/agents/model.test.ts`, add failing case: injectable `composeResilientModel` (or equivalent) with primary that always rejects and reserve that resolves → invoke succeeds; reserve call count === 1; primary attempted `MODEL_MAX_RETRIES + 1` times before reserve
- [ ] T010 [P] [US1] In `src/agents/model.test.ts`, add failing case: primary resolves on first try with reserve configured → reserve call count === 0

### Implementation for User Story 1

- [ ] T011 [US1] Implement internal `composeResilientModel` in `src/agents/model.ts`: build `ChatOpenAI` (or injectable runnables in tests) with `maxRetries: 0`; `primary.withRetry({ stopAfterAttempt: MODEL_MAX_RETRIES + 1 })`; if reserve present, `withFallbacks([reserve])` per `research.md` Decisão 2 and `contracts/model-factory.md`
- [ ] T012 [US1] Wire `createModel` / `createCountingModel` in `src/agents/model.ts` to return the composed runnable (counting wrapper still enforces `maxIterations` and token counts); keep `MissingModelConfigError` when apiKey/primary missing; do not invent a reserve when env fallback is absent
- [ ] T013 [US1] Run US1 tests + `npm run typecheck` until green; fix any `createReactAgent` / `withStructuredOutput` type breakages with the minimal adapter documented in `research.md` Decisão 4 (structured helper may wait until polish if router still typechecks)

**Checkpoint**: MVP — falha do principal com reserva configurado ainda responde; principal saudável não chama reserva

---

## Phase 4: User Story 2 - Configurar o modelo reserva por ambiente (Priority: P1)

**Goal**: `OPENROUTER_MODEL_FALLBACK` é a única superfície de reserva; ausente/vazia → só principal; id do reserva aparece quando ele atende.

**Independent Test**: Env map sem fallback → falha do principal lança indisponibilidade sem segundo modelo; com fallback setado → `getModelUsed()` / sessão reflete id do reserva após troca.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T014 [P] [US2] In `src/agents/model.test.ts`, add failing case: `createModel` / compose with env lacking `OPENROUTER_MODEL_FALLBACK` (or whitespace) and failing primary → throws `ModelUnavailableError` (or rejects) with **zero** reserve invocations
- [ ] T015 [P] [US2] In `src/agents/model.test.ts`, add failing case: primary id `model-a`, fallback env `model-b`, primary fails / reserve ok → session or return path reports used model id exactly `model-b` (not `model-a`)

### Implementation for User Story 2

- [ ] T016 [US2] Ensure `createModel` / `createCountingModel` in `src/agents/model.ts` call `resolveFallbackModel(env)` and pass the resolved id into composition; when `undefined`, compose retry-only primary (FR-008)
- [ ] T017 [US2] Run US2 tests + `npm run typecheck` until green

**Checkpoint**: Reserva só existe quando a env traz id não vazio

---

## Phase 5: User Story 3 - Ver no rastro e nas métricas qual modelo respondeu (Priority: P1)

**Goal**: Evento `fallback` no `trace` na troca; `metrics.modelUsed` em todo 200 que consultou o modelo; pedido vazio sem esses campos.

**Independent Test**: Após invoke com troca → `didFallback()` / evento `{ type: "fallback", from, to }`; sucesso só no principal → sem evento e `modelUsed` = primary; HTTP/chat preserva `modelUsed` no JSON.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US3] In `src/agents/model.test.ts`, add failing cases: after successful fallback, `buildFallbackEvent` / session yields `{ type: "fallback", from: primary, to: reserve }` and `getModelUsed() === reserve`; after primary-only success, `didFallback() === false` and `getModelUsed() === primary`
- [ ] T019 [P] [US3] In `src/agents/trace.test.ts`, add case that `formatTrace` includes a `[fallback]` section for a fixture event with `from`/`to`
- [ ] T020 [P] [US3] In `src/http/server.test.ts`, add failing case: fake strategy returns 200 payload with `metrics.modelUsed` and a `fallback` trace event → response JSON preserves both (no strip in `runChat` / server)

### Implementation for User Story 3

- [ ] T021 [US3] Add observation wrappers / session getters on the resilient model in `src/agents/model.ts` (`getModelUsed`, `didFallback`, pure `buildFallbackEvent({ from, to, node? })`) per `research.md` Decisão 3 and `data-model.md`
- [ ] T022 [US3] In strategy paths that use the factory (`src/agents/react.ts`, and plan-and-execute / production path as needed), after successful model work: set `metrics.modelUsed` from session; if `didFallback()`, append `buildFallbackEvent` to `trace` (with appropriate `node` when known)
- [ ] T023 [US3] Preserve `metrics.modelUsed` when aggregating in `src/services/chat-service.ts` (and `src/agents/production-graph.ts` if metrics are merged there); blank/`buildEmptyInputResult` path must **omit** `modelUsed` and must not emit `fallback`
- [ ] T024 [US3] Run US3 tests + `npm run typecheck` until green

**Checkpoint**: Plantonista vê quem respondeu e se houve troca

---

## Phase 6: User Story 4 - Indisponibilidade total devolve 503 (Priority: P1)

**Goal**: Principal (± reserva) esgotados → `ModelUnavailableError` → HTTP 503 `{ message: "Modelo indisponível." }` sem `answer`/`trace`/`metrics`; sem soft-200 `MODEL_UNAVAILABLE_ANSWER` para falha total.

**Independent Test**: Factory ambos falham → `ModelUnavailableError`; `POST /chat` com estratégia que lança esse erro → 503; config missing permanece `MissingModelConfigError` (fora deste 503 de runtime).

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T025 [P] [US4] In `src/agents/model.test.ts`, add failing case: primary and reserve both reject (and case: no reserve + primary rejects) → throws `ModelUnavailableError` with message `Modelo indisponível.`
- [ ] T026 [P] [US4] In `src/http/server.test.ts`, add failing case: injected registry/strategy throws `ModelUnavailableError` → status 503, body `{ message: "Modelo indisponível." }`, no `answer`/`trace`/`metrics` keys

### Implementation for User Story 4

- [ ] T027 [US4] Ensure exhausted resilient invoke in `src/agents/model.ts` throws `ModelUnavailableError` (wrap underlying errors for logs if needed; do not leak stack in `message`)
- [ ] T028 [US4] In `src/agents/react.ts` and `src/agents/plan-and-execute.ts`, rethrow `ModelUnavailableError` instead of returning soft `MODEL_UNAVAILABLE_ANSWER` 200 for that case; align `src/agents/reflection.ts` / tests that assumed soft unavailable answer where the new contract applies
- [ ] T029 [US4] Map `ModelUnavailableError` → `res.status(503).json({ message: error.message })` in `src/http/server.ts` (alongside existing embedding 503); keep `MissingModelConfigError` behavior unchanged
- [ ] T030 [US4] Run US4 tests + `npm run typecheck` until green

**Checkpoint**: Indisponibilidade total é 503 observável, não resposta falsa

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Roteador structured, suíte completa, quickstart

- [ ] T031 [P] Add helper in `src/agents/model.ts` (e.g. `createStructuredModel`) applying `withStructuredOutput` per base chat then `withRetry` / `withFallbacks`, and switch `createLlmRouter` in `src/agents/production-graph.ts` to use it so router inherits resiliência without calling `withStructuredOutput` on the fallbacks wrapper
- [ ] T032 [P] Update any broken unit tests under `src/agents/*.test.ts` / `src/http/server.test.ts` that still expect soft `MODEL_UNAVAILABLE_ANSWER` on total model failure
- [ ] T033 Run full `npm run typecheck` and `npm test` until green
- [ ] T034 Manually walk `specs/014-resiliencia-modelo/quickstart.md` checklist (unit factory table + HTTP 503 case); fix gaps if any assertion from the table is missing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational; naturally builds on US1 composition (env → reserve eligibility)
- **US3 (Phase 5)**: After US1 session/composition exists; can overlap US2 if env already wired in Foundational/US1
- **US4 (Phase 6)**: After factory can exhaust (US1/US2); HTTP mapping independent of US3 but full product needs both
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — core retry + fallbacks composition
- **US2 (P1)**: After Phase 2 — env surface; shares `model.ts` with US1 (sequential on that file recommended)
- **US3 (P1)**: Needs composed model + types from Phase 2/US1; chat/strategy stamping
- **US4 (P1)**: Needs throw path from factory; strategies + `server.ts`

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Composition before caller wiring
- Story complete before moving to next priority when touching the same files

### Parallel Opportunities

- T001 ∥ T002 (Setup)
- T003 ∥ T004 ∥ T005 (Foundational, different files)
- T009 ∥ T010 (US1 tests)
- T014 ∥ T015 (US2 tests)
- T018 ∥ T019 ∥ T020 (US3 tests)
- T025 ∥ T026 (US4 tests)
- T031 ∥ T032 (Polish)
- US3 HTTP assert (T020) can proceed once types exist even before full strategy stamp, if fake returns the fields

---

## Parallel Example: User Story 1

```bash
# Tests in parallel:
Task: "T009 primary always fails + reserve ok in src/agents/model.test.ts"
Task: "T010 primary ok → reserve not called in src/agents/model.test.ts"

# Then sequential implementation on model.ts:
Task: "T011 composeResilientModel"
Task: "T012 wire createModel / createCountingModel"
Task: "T013 typecheck + US1 tests green"
```

---

## Parallel Example: User Story 3

```bash
Task: "T018 session/fallback event cases in src/agents/model.test.ts"
Task: "T019 formatTrace fallback in src/agents/trace.test.ts"
Task: "T020 HTTP preserves modelUsed/fallback in src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 (retry + fallbacks composition)
4. **STOP and VALIDATE** with `model.test.ts` fakes
5. Then US2 env hardening → US3 observability → US4 503

### Incremental Delivery

1. Setup + Foundational → types/env/error ready
2. US1 → demo: reserve salva o turno (fábrica)
3. US2 → demo: sem env não há segundo modelo
4. US3 → demo: `fallback` + `modelUsed` no `/chat`
5. US4 → demo: 503 quando nada responde
6. Polish → router structured + suíte verde

### Parallel Team Strategy

1. Together: Setup + Foundational
2. Dev A: US1/US2 on `model.ts`
3. Dev B: US3 types already done — `trace.test` / HTTP preserve; then strategy stamping after US1 API stabilizes
4. Dev C: US4 `server.ts` mapping + strategy rethrow once `ModelUnavailableError` exists (T003)

---

## Notes

- [P] = different files, no dependencies on incomplete tasks
- Do not create `src/agents/models.ts` — extend `src/agents/model.ts`
- Do not stack SDK `maxRetries` with `withRetry` (keep ChatOpenAI `maxRetries: 0`)
- Soft 200 with `MODEL_UNAVAILABLE_ANSWER` for total model failure is out of contract after US4
- Commit after each task or logical group; keep `typecheck` / `test` green at checkpoints
