# Tasks: Orçamento de contexto por seção

**Input**: Design documents from `/specs/012-orcamento-contexto/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — spec US4 / FR-008 / SC-003–SC-004 (“tetos baixos cortam na ordem certa”); constituição princípio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto tipado do ContextBuilder sem alterar o comportamento do `/chat` ainda

- [X] T001 [P] Create `src/context/context-builder.ts` exporting types `ContextBudgets`, `MemoryItem`, `ContextSectionInput`, `BuiltContext` per `data-model.md` / `contracts/context-builder.md`, plus stubs `resolveContextBudgets(env?)` and `buildContext(input, budgets)` that throw `Error("not implemented")`
- [X] T002 [P] Create `src/context/context-builder.test.ts` with `node:test` importing the stubs (`test.todo` or failing placeholder OK)

**Checkpoint**: Módulo novo existe; typecheck do restante intacto

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Resolve de tetos via env e tipos estáveis — bloqueia todas as user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Implement `resolveContextBudgets` in `src/context/context-builder.ts` per `contracts/context-budget-env.md`: defaults `summary=200`, `window=1200`, `memory=300`; accept only `/^\d+$/` → integer ≥ 0; invalid/absent → default; read from injected `env` map (default `process.env`); never read `.env` file
- [X] T004 Replace stub tests in `src/context/context-builder.test.ts` with cases for `resolveContextBudgets`: absent → defaults; `"200"`/`"0"` overrides; `"abc"` / `"-1"` / `"12.7"` → default; partial overrides leave other sections at default
- [X] T005 Run `npm run typecheck` and `node --import tsx --test src/context/context-builder.test.ts` until green after T003–T004

**Checkpoint**: Budgets tipados e testados — US1 pode montar; US2–US4 podem cortar/assertir

---

## Phase 3: User Story 1 - Montar o prompt de qualquer estratégia com tetos por seção (Priority: P1) 🎯 MVP

**Goal**: `buildContext` produz `prompt` + `sections` a partir das cinco seções; `runChat` usa o builder (caminho único de todas as estratégias); tetos padrão aplicados às seções cortáveis; `contextBreakdown` estima seções pós-orçamento.

**Independent Test**: Chamar `buildContext` com seções dentro do teto → prompt na ordem system → memory → summary → (window + message); `runChat` com fake eco → prompt passa pelo builder (não pelo `parts.join` antigo).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US1] In `src/context/context-builder.test.ts`, add case: all sections within high budgets → `sections.system`/`message` equal input; `prompt` joins non-empty parts as system → memory → summary → window+message; empty summary/memory omitted; no invented content
- [X] T007 [P] [US1] In `src/http/server.test.ts` (or `chat-service` test), add/adjust case: fake strategy echoes prompt; with memory+summary+history, composition still reaches `strategy.run` and `contextBreakdown` uses `estimateTokens` of budgeted section strings (history includes current message contribution)

### Implementation for User Story 1

- [X] T008 [US1] Implement `buildContext` in `src/context/context-builder.ts`: accept `ContextSectionInput` + `ContextBudgets`; reuse `renderHistoryPrompt` / `renderSummaryPrompt` / `renderMemoryPrompt`; compose `prompt` per contract; for MVP, if over budget temporarily still compose (hard cuts land in US2/US3) OR apply budgets if already implementing cuts — must export complete `BuiltContext` including `kept.window` / `kept.memory`
- [X] T009 [US1] In `src/services/chat-service.ts`, replace ad-hoc `[memoryBlock, summaryBlock, history].join`: build `ContextSectionInput` with `system: ""`, `message: input.message`, `summary` from store text (raw), `window` = prior messages in selected window **excluding** current, `memory` = recall items with `fact` + `score`; call `resolveContextBudgets(process.env)` + `buildContext`; pass `built.prompt` to `strategy.run`; set `contextBreakdown` from `estimateTokens` of `built.sections` (history = window block + current message line as in prompt)
- [X] T010 [US1] Keep blank-input / error paths unchanged (no builder call that invents content); `HISTORY_LIMIT` and summarizer/recall logic untouched
- [X] T011 [US1] Run US1 tests + `npm run typecheck` until green

**Checkpoint**: MVP — todas as estratégias recebem prompt via ContextBuilder com budgets resolvidos

---

## Phase 4: User Story 2 - Preservar sistema e mensagem atual (Priority: P1)

**Goal**: Sistema e mensagem atual nunca truncados/removidos; cortes só em summary/window/memory; seções ausentes omitidas.

**Independent Test**: `buildContext` with huge `system`/`message` and `budgets` of `0` (or very low) on cuttable sections → system/message strings identical to input; cuttable sections empty or ≤ teto.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US2] In `src/context/context-builder.test.ts`, add case: long `system` + long `message` + oversized summary/window/memory with low budgets → `sections.system === input.system` and `sections.message === input.message` (strict); cuttable sections do not alter those strings
- [X] T013 [P] [US2] In `src/context/context-builder.test.ts`, add case: empty summary and empty memory → omitted from `prompt`; system + message (and optional window) still present intact

### Implementation for User Story 2

- [X] T014 [US2] In `src/context/context-builder.ts`, enforce untouchable copy of `system`/`message` into `sections` and `prompt` composition; never slice/trim them for budget; ensure empty summary/memory yield `""` and are filtered from join
- [X] T015 [US2] Run US2 tests + `npm run typecheck` until green

**Checkpoint**: Núcleo do pedido protegido sob qualquer teto

---

## Phase 5: User Story 3 - Cortar janela (mais antigas) e memória (menor score) (Priority: P1)

**Goal**: Janela remove índice 0 (mais antiga) até `estimateTokens(sections.window) ≤ budgets.window`; memória remove menor `score` (empate: índice original ASC) até ≤ `budgets.memory`; resumo trunca prefixo até ≤ `budgets.summary`; dentro do teto = sem remoção.

**Independent Test**: Fixtures with known ages/scores and low budgets → kept sets match contract; single oversized item dropped/truncated; in-budget input unchanged.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T016 [P] [US3] In `src/context/context-builder.test.ts`, add window cases: three prior messages, budget allowing only newest → `kept.window` is the newest only; in-budget window → no removals; single message whose render alone exceeds budget → not kept
- [X] T017 [P] [US3] In `src/context/context-builder.test.ts`, add memory cases: scores `0.9`, `0.5`, `0.2` with tight budget → drop `0.2` first then `0.5`; equal scores → stable by original index; in-budget → unchanged order of survivors as in input
- [X] T018 [P] [US3] In `src/context/context-builder.test.ts`, add summary case: huge summary text → `estimateTokens(sections.summary) ≤ budgets.summary` and block still uses `Resumo da conversa:` prefix when non-empty

### Implementation for User Story 3

- [X] T019 [US3] Implement window trim in `src/context/context-builder.ts`: while `estimateTokens(renderHistoryPrompt(kept)) > budgets.window` and length &gt; 0, `shift()` oldest; set `sections.window` from render or `""`
- [X] T020 [US3] Implement memory trim in `src/context/context-builder.ts`: sort copy by `score ASC, index ASC`; drop from front until render fits; `kept.memory` preserves relative input order of survivors; `sections.memory` via `renderMemoryPrompt`
- [X] T021 [US3] Implement summary trim in `src/context/context-builder.ts`: blank → `""`; else `renderSummaryPrompt` then truncate body so `estimateTokens(block) ≤ budgets.summary` (prefix; max content guided by `budget * 4` chars heuristic per research)
- [X] T022 [US3] Run US3 tests + `npm run typecheck` until green

**Checkpoint**: Políticas de corte alinhadas ao contrato

---

## Phase 6: User Story 4 - Conferência automatizada da ordem de corte (Priority: P1)

**Goal**: Suite dedicada com tetos baixos prova ordem de corte (system/message intactos; janela oldest-first; memória lowest-score-first; tetos respeitados); `typecheck` + `npm test` verdes.

**Independent Test**: `node --import tsx --test src/context/context-builder.test.ts` + full `npm test` / `npm run typecheck`.

### Tests for User Story 4 ⚠️

> **NOTE: Consolidate / extend failing-first if gaps remain after US2–US3**

- [X] T023 [P] [US4] In `src/context/context-builder.test.ts`, add single integration-style case with artificially low budgets covering all three cuttable sections at once: assert removal order (oldest window msgs gone, lowest memory scores gone), `estimateTokens` caps, and system/message byte-identical to input
- [X] T024 [P] [US4] In `src/context/context-builder.test.ts`, add determinism case: same input+budgets twice → `deepEqual` on `BuiltContext` (or prompt + kept)

### Implementation for User Story 4

- [X] T025 [US4] Fix any remaining gaps in `src/context/context-builder.ts` so T023–T024 pass without weakening assertions
- [X] T026 [US4] Confirm `src/services/chat-service.ts` breakdown remains post-budget; adjust `src/http/server.test.ts` only if existing asserts break due to trimming (keep green)
- [X] T027 [US4] Run `npm run typecheck` and `npm test` until fully green

**Checkpoint**: Regressão de ordem de corte coberta; suíte do projeto verde

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação quickstart e higiene final

- [X] T028 [P] Walk `specs/012-orcamento-contexto/quickstart.md` commands (`typecheck`, `npm test`, optional builder-only test file) and fix doc drift if any
- [X] T029 Ensure no `.env` file reads introduced; only `process.env` / injected map for `CONTEXT_BUDGET_*`
- [X] T030 Final `npm run typecheck` && `npm test` green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP wire
- **US2 (Phase 4)**: After US1 `buildContext` exists (same module; sequential recommended)
- **US3 (Phase 5)**: After US2 untouchable invariants (cuts must not touch system/message)
- **US4 (Phase 6)**: After US3 cut policies — consolidates proof
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP
- **US2 (P1)**: Practically after US1 implementation of `buildContext`
- **US3 (P1)**: After US2 (or same module sequentially after T014)
- **US4 (P1)**: After US3 — test consolidation + full suite

### Within Each User Story

- Tests FIRST (fail before implementation)
- Implement → typecheck/story tests green
- Commit after each task or logical group

### Parallel Opportunities

- T001 || T002 (Setup)
- T006 || T007 (US1 tests)
- T012 || T013 (US2 tests)
- T016 || T017 || T018 (US3 tests)
- T023 || T024 (US4 tests)
- T028 || T029 (Polish)
- US stories are **same-file** (`context-builder.ts` / `chat-service.ts`) → prefer sequential implementation, parallel only on test authoring

---

## Parallel Example: User Story 3

```bash
# Author US3 tests in parallel (same test file — coordinate hunks or sequential writes):
Task: "Window cut cases in src/context/context-builder.test.ts"
Task: "Memory cut cases in src/context/context-builder.test.ts"
Task: "Summary trim case in src/context/context-builder.test.ts"

# Then implement cuts sequentially in src/context/context-builder.ts:
Task: "Window trim"
Task: "Memory trim"
Task: "Summary trim"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (`resolveContextBudgets`)
3. Phase 3 US1 (`buildContext` + wire `chat-service`)
4. **STOP and VALIDATE**: eco `/chat` ainda funciona; budgets resolvidos
5. Then US2 → US3 → US4 for cut correctness

### Incremental Delivery

1. Setup + Foundational → budgets ready
2. US1 → all strategies via builder (MVP)
3. US2 → untouchable system/message
4. US3 → cut policies
5. US4 → low-budget order proof + full suite
6. Polish → quickstart

### Parallel Team Strategy

Limited parallelism: one owner for `context-builder.ts` + `chat-service.ts`; second person can draft tests in `context-builder.test.ts` ahead of implementation.

---

## Notes

- [P] = different files or non-conflicting test authoring; same-file impl tasks are sequential
- Spec constraints to quote in impl: defaults **200 / 1200 / 300**; env names `CONTEXT_BUDGET_SUMMARY|WINDOW|MEMORY`; invalid → default; message excluded from cuttable window; score tie-break index ASC
- Out of scope: global budget, HISTORY_LIMIT change, summarizer/recall redesign, `.env` file loading
- Suggested MVP: Phases 1–3 (US1)

