# Tasks: Medição de contexto

**Input**: Design documents from `/specs/010-medicao-contexto/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-009 / SC-001…SC-006 / US4 e constituição princípio V exigem conferência com fixtures e substitutos (sem OpenRouter na suíte).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`; script na raiz `conversa-longa.sh`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto `src/context/` e shells de teste (plan.md / research Decisão 1) sem alterar `/chat` ainda

- [ ] T001 [P] Create `src/context/tokens.ts` exporting stubs `estimateTokens(text: string): number` and `readPromptTokens(source: unknown): number` that throw `Error("not implemented")`
- [ ] T002 [P] Create `src/context/tokens.test.ts` with `node:test` + `node:assert/strict` importing the stubs (single `test.todo` or failing placeholder OK)

**Checkpoint**: Módulo de contexto existe e typecheck do arquivo novo não quebra o restante

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Estender `Metrics` com `promptTokens: number` (≥ 0, default 0) e fazer `runWithMetrics` / resultados vazios repassarem o campo — sem breakdown HTTP ainda

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Extend `Metrics` in `src/agents/strategy.ts` with `promptTokens: number`; update `buildEmptyInputResult` to `promptTokens: 0`; update `runWithMetrics` to set `promptTokens: result.metrics?.promptTokens ?? 0` alongside `llmCalls` / `latencyMs`
- [ ] T004 [P] Fix compile fallout from T003: any literal `metrics: { llmCalls, latencyMs }` in `src/agents/` (react, plan-and-execute, reflection, strategy tests, arena/bench if they construct Metrics) must include `promptTokens` (usually `0` or summed value) until US2 fills real accumulation
- [ ] T005 Run `npm run typecheck` until green after T003–T004

**Checkpoint**: Foundation tipada — US1 pode implementar funções puras; US2 pode acumular usage

---

## Phase 3: User Story 1 - Estimar e ler uso real de tokens (Priority: P1) 🎯 MVP

**Goal**: `estimateTokens` (chars÷4, divisão inteira) e `readPromptTokens` (usage LangChain → prompt tokens, ausente → 0) estáveis e testáveis.

**Independent Test**: Fixtures de texto e usage em `src/context/tokens.test.ts` passam sem HTTP nem modelo.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006 [P] [US1] In `src/context/tokens.test.ts`, add `estimateTokens` cases per `contracts/tokens.md`: `""` → `0`; length 1–3 → `0`; `"abcd"` → `1`; `"abcde"` → `1`; `"abcdefgh"` → `2`; assert spaces count (no trim)
- [ ] T007 [P] [US1] In `src/context/tokens.test.ts`, add `readPromptTokens` cases: `{ usage_metadata: { input_tokens: 42 } }` → `42`; AIMessage-like `{ usage_metadata: { input_tokens: 7 } }` → `7`; `{ response_metadata: { tokenUsage: { prompt_tokens: 10 } } }` → `10`; `{ response_metadata: { tokenUsage: { promptTokens: 11 } } }` → `11`; `undefined` / `{}` / `{ usage_metadata: { output_tokens: 5 } }` (só completion) → `0`; negative/`NaN` → `0`

### Implementation for User Story 1

- [ ] T008 [US1] Implement `estimateTokens` in `src/context/tokens.ts` as `Math.floor(text.length / 4)` (never throws)
- [ ] T009 [US1] Implement `readPromptTokens` in `src/context/tokens.ts` per `contracts/tokens.md` priority: `usage_metadata.input_tokens` → `tokenUsage.prompt_tokens|promptTokens` → direct `input_tokens|prompt_tokens|promptTokens` → `0`; never throws
- [ ] T010 [US1] Run `npm test -- src/context/tokens.test.ts` and `npm run typecheck` until green

**Checkpoint**: MVP utilitário — estimativa e leitura de usage conferíveis

---

## Phase 4: User Story 2 - Ver promptTokens e breakdown no `/chat` (Priority: P1)

**Goal**: Estratégias acumulam `metrics.promptTokens` real; `/chat` 200 inclui `promptTokens` + `contextBreakdown: { history, memory }` estimado (chars÷4); métricas 007+ permanecem.

**Independent Test**: POST `/chat` com registry fake (`promptTokens` fixo) e memory fake → body com campos; vazio → zeros; sem `userId` → `memory: 0`.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T011 [P] [US2] In `src/http/server.test.ts`, add case: fake strategy returns `metrics.promptTokens: 99` (plus existing llmCalls/latencyMs); POST `/chat` valid → 200 with `metrics.promptTokens === 99`, `contextBreakdown.history` / `.memory` present as numbers, and `llmCalls`/`latencyMs`/`historyMessages` still present
- [ ] T012 [P] [US2] In `src/http/server.test.ts`, add case: blank message → `promptTokens === 0` and `contextBreakdown: { history: 0, memory: 0 }`
- [ ] T013 [P] [US2] In `src/http/server.test.ts`, add case: `userId` + memoryStore fake with known recall facts → `contextBreakdown.memory === estimateTokens(renderMemoryPrompt(facts))` and `contextBreakdown.history === estimateTokens` of the history string; without `userId` → `memory === 0`
- [ ] T014 [P] [US2] In `src/agents/strategy.test.ts` (or model-focused test), add/adjust case that `runWithMetrics` preserves a non-zero `promptTokens` from work; if adding `createCountingModel` unit hook is cleaner, put accumulation assert in a small test next to `src/agents/model.ts` usage patterns already covered by strategy tests

### Implementation for User Story 2

- [ ] T015 [US2] In `src/agents/model.ts`, extend `createCountingModel` / `LimitedModel` with `getPromptTokens(): number`; after each successful `super.invoke`, add `readPromptTokens(result)` to an internal accumulator (import from `src/context/tokens.ts`)
- [ ] T016 [US2] In `src/agents/react.ts`, return `metrics.promptTokens: getPromptTokens()` (0 on empty-input path already via `buildEmptyInputResult`); on catch path still report accumulated promptTokens so far
- [ ] T017 [US2] In `src/agents/plan-and-execute.ts`, accumulate prompt tokens across model invokes (prefer counting-model getter if used; else `readPromptTokens` on AIMessage results) and include `promptTokens` in returned `metrics` (including early/error paths that already set `llmCalls`)
- [ ] T018 [US2] Extend `CriticEvaluateResult` in `src/agents/critic.ts` with `promptTokens: number`; stubs/tests return `0`; LLM critic sets value via `readPromptTokens` when available else `0`
- [ ] T019 [US2] In `src/agents/reflection.ts`, sum `promptTokens` from base results + critic evaluations the same way `llmCalls` is summed; include in every return `metrics` object
- [ ] T020 [US2] Extend `ChatResult` metrics in `src/services/chat-service.ts` with `promptTokens` and `contextBreakdown: { history: number; memory: number }`; after building `history` and `memoryBlock`, set breakdown via `estimateTokens`; on success merge `result.metrics.promptTokens`; blank-input path → `promptTokens: 0`, breakdown zeros; do **not** include learning-reflector (009) usage
- [ ] T021 [US2] Confirm `src/http/server.ts` still serializes `result.metrics` as-is (no omit of new fields); adjust only if something strips unknown keys
- [ ] T022 [US2] Run US2 HTTP/strategy tests + `npm run typecheck` until green

**Checkpoint**: `/chat` observa promptTokens real e breakdown estimado por fonte

---

## Phase 5: User Story 3 - Ensaio de conversa longa (Priority: P2)

**Goal**: `conversa-longa.sh` na raiz executa N≥2 turnos na mesma conversa e imprime `promptTokens` por turno.

**Independent Test**: Com `npm run dev` no ar, `TURNS=3 ./conversa-longa.sh` imprime 3 linhas; servidor parado → exit ≠ 0.

### Tests for User Story 3 ⚠️

> Script é smoke manual (contracts/conversa-longa.md). Validação automatizada = checklist de contrato no próprio shell + quickstart; sem servidor na CI.

- [ ] T023 [P] [US3] Document expected env defaults in script header comments: `BASE_URL` default `http://127.0.0.1:3000`, `TURNS` default ≥ 2, per `contracts/conversa-longa.md`

### Implementation for User Story 3

- [ ] T024 [US3] Create `conversa-longa.sh` at repo root: `set -euo pipefail`; loop `TURNS` POSTs to `$BASE_URL/chat` with JSON `message`; capture `conversationId` after first 200 and reuse; on each 200 print one line `turn=<i> promptTokens=<n>` from `metrics.promptTokens` (jq or python/node one-liner OK); on non-200/curl fail print to stderr and `exit 1` without erasing prior lines; `chmod +x` where applicable
- [ ] T025 [US3] Manually smoke once against local `npm run dev` (or note in PR if env lacks model — script must still print numeric `promptTokens`, even if 0) and fix parsing until output matches contract

**Checkpoint**: Ensaio de conversa longa observável por turno

---

## Phase 6: User Story 4 - Conferência automatizada (Priority: P1)

**Goal**: Suíte cobre estimativa, usage, métricas `/chat` e somas da reflection; `npm test` + `npm run typecheck` verdes sem provedor externo obrigatório.

**Independent Test**: Rodar suíte completa; casos do quickstart §1 passam.

### Tests for User Story 4 ⚠️

> **NOTE: Fill gaps from quickstart table; prefer FAIL-first if a case is still missing**

- [ ] T026 [P] [US4] In `src/agents/reflection.test.ts`, add case: base `promptTokens: 3` + critic stub `promptTokens: 2` → wrap result `metrics.promptTokens === 5` (mirror existing llmCalls sum test)
- [ ] T027 [P] [US4] Audit `src/http/server.test.ts` / chat cases for regressions: 4xx/504 still omit metrics; existing `historyMessages` asserts still pass with new fields present on 200

### Implementation for User Story 4

- [ ] T028 [US4] Fix any remaining stub critics / fake strategies in tests under `src/` that omit `promptTokens` so the full suite compiles and asserts
- [ ] T029 [US4] Run full `npm test` and `npm run typecheck` until green (SC-006)

**Checkpoint**: Conferência automatizada completa e verde

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Alinhamento final com quickstart e limpeza

- [ ] T030 [P] Skim `specs/010-medicao-contexto/quickstart.md` checklist rows 1–11 against implemented tests; add any missing assert called out there into the nearest existing `*.test.ts`
- [ ] T031 Confirm arena/bench still typecheck if they construct metrics (extra `promptTokens: 0` only — no requirement to print breakdown)
- [ ] T032 Final `npm test` + `npm run typecheck` green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP utilitário
- **US2 (Phase 4)**: After US1 (`estimateTokens` / `readPromptTokens` used by model + chat-service)
- **US3 (Phase 5)**: After US2 (`metrics.promptTokens` must exist on `/chat` 200)
- **US4 (Phase 6)**: After US2 (ideally after US3 script exists, but suite can run without smoke); closes reflection/regression gaps
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — no other stories
- **US2 (P1)**: Needs US1 functions; delivers product surface
- **US3 (P2)**: Needs US2 HTTP metrics
- **US4 (P1)**: Cross-cutting verification; depends on US1+US2 code paths (reflection sum)

### Within Each User Story

- Tests (listed) written to FAIL before implementation where noted
- Pure tokens before model/chat wiring
- Strategy accumulation before chat breakdown
- Story complete before next priority when sequential

### Parallel Opportunities

- T001 || T002 (Setup)
- T006 || T007 (US1 tests)
- T011 || T012 || T013 || T014 (US2 tests, different cases; same file — serialize if conflict)
- T015–T019 touch different agent files after T014 — can parallelize cautiously by file (`model` / `react` / `plan-and-execute` / `critic` / `reflection`)
- T026 || T027 (US4 tests)

---

## Parallel Example: User Story 1

```bash
# Tests in parallel (same file — prefer sequential edits, parallel design):
Task: "estimateTokens cases in src/context/tokens.test.ts"
Task: "readPromptTokens cases in src/context/tokens.test.ts"

# Then implement:
Task: "estimateTokens in src/context/tokens.ts"
Task: "readPromptTokens in src/context/tokens.ts"
```

## Parallel Example: User Story 2

```bash
# After US1 green — HTTP cases can be authored together:
Task: "server.test.ts promptTokens 99"
Task: "server.test.ts blank zeros"
Task: "server.test.ts memory breakdown"

# Implementation by file:
Task: "model.ts getPromptTokens"
Task: "react.ts metrics.promptTokens"
Task: "plan-and-execute.ts accumulate"
Task: "critic.ts + reflection.ts sum"
Task: "chat-service.ts contextBreakdown"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (`Metrics.promptTokens`)
3. Phase 3 US1 (`tokens.ts` + tests)
4. **STOP and VALIDATE**: `npm test -- src/context/tokens.test.ts`

### Incremental Delivery

1. Setup + Foundational → tipagem segura
2. US1 → utilitário puro (MVP)
3. US2 → `/chat` observável
4. US3 → script smoke
5. US4 + Polish → suíte completa verde

### Parallel Team Strategy

1. Together: Setup + Foundational
2. Then: A = US1→US2 core; B = US2 HTTP tests / reflection; C = US3 script after US2 lands metrics

---

## Notes

- [P] = different files, no incomplete-task dependency
- Spec pediu testes explicitamente — tasks de teste incluídas
- `promptTokens` do turno **não** inclui learning-reflector 009
- Breakdown estimado pode divergir do real — não assertar igualdade soma↔promptTokens
- Commit after each task or logical group (constituição VIII)
- Next command: `/speckit-implement`
