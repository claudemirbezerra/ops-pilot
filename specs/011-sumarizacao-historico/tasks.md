# Tasks: Sumarização de histórico (pruning)

**Input**: Design documents from `/specs/011-sumarizacao-historico/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — spec pede “teste fake” (US4 / FR-011 / SC-005); constituição princípio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto tipado da porta do sumarizador e stubs de composição sem alterar o comportamento do `/chat` ainda

- [X] T001 [P] Create `src/agents/conversation-summarizer.ts` exporting `SummarizeInput`, `ConversationSummarizer`, and stub `createLlmConversationSummarizer()` that throws `Error("not implemented")` per `contracts/summarizer.md`
- [X] T002 [P] Create `src/agents/conversation-summarizer.test.ts` with `node:test` importing the stubs (`test.todo` or failing placeholder OK)
- [X] T003 [P] Add pure stub `renderSummaryPrompt(text: string): string` in `src/services/history-prompt.ts` that throws `Error("not implemented")` (or returns placeholder) without changing `HISTORY_LIMIT` yet

**Checkpoint**: Módulos novos existem; typecheck do restante intacto

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Janela 8 tipada, tipos/store de resumo, `TraceEvent` e wiring DI — sem gatilho de consolidação nem inclusão no prompt ainda

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Change `HISTORY_LIMIT` from `12` to `8` in `src/services/history-prompt.ts`; update `src/services/history-prompt.test.ts` asserts that hardcode 12 → 8
- [X] T005 Update HTTP/window cases in `src/http/server.test.ts` that seed/assert `historyMessages === 12` / “12 newest” to use **8** (keep tests green after limit change)
- [X] T006 Extend `ConversationStore` in `src/domain/types.ts` with: `StoredMessage = ConversationMessage & { id: number }`; `ConversationSummaryRecord = { text: string; coveredThroughId: number }`; methods `getSummary`, `upsertSummary(conversationId, text, coveredThroughId)`, `listUnsummarizedOutsideWindow(conversationId, windowSize, coveredThroughId)` per `contracts/conversation-store.md` / `data-model.md` (`summary` NOT NULL; `covered_through_id` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; one row per conversation)
- [X] T007 Implement DDL `CREATE TABLE IF NOT EXISTS conversation_summaries (...)` and the three methods in `src/store/sqlite-conversation-store.ts` (prepared statements; `ConversationNotFoundError` for unknown id; reject `upsertSummary` when `text.trim()` empty; `listUnsummarizedOutsideWindow` returns `id > coveredThroughId` excluding the `windowSize` newest, ordered ASC)
- [X] T008 [P] Extend `TraceEvent` in `src/agents/strategy.ts` with `{ type: "summarize"; content: string }` (no emission yet)
- [X] T009 [P] Extend `CreateAppOptions` / `RunChatInput` in `src/http/server.ts` and `src/services/chat-service.ts` with optional `conversationSummarizer?: ConversationSummarizer`; default later in US2 (`createLlmConversationSummarizer`)
- [X] T010 Add store tests in `src/store/sqlite-conversation-store.test.ts` for `:memory:`: `getSummary` null on new conversation; `upsertSummary` then `getSummary`; replace on second upsert; isolation across conversations; `listUnsummarizedOutsideWindow` with seeded messages (windowSize 8, covered 0 → pending outside last 8); unknown conversation → domain error
- [X] T011 Run `npm run typecheck` and `npm test` until green after T004–T010

**Checkpoint**: Foundation tipada — US1 pode ler/compor resumo; US2 pode consolidar; US3 pode emitir evento

---

## Phase 3: User Story 1 - Manter o fio longo sem perder o essencial (Priority: P1) 🎯 MVP

**Goal**: Prompt com no máximo 8 mensagens brutas + bloco `Resumo da conversa:` quando há resumo vigente; `historyMessages` 0–8; `contextBreakdown.summary`; isolamento entre conversas.

**Independent Test**: Seed `upsertSummary` + >8 messages; fake strategy echoes prompt → contains summary block and ≤8 Plantonista/Copiloto lines; `historyMessages ≤ 8`; other conversation’s summary absent.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] In `src/services/history-prompt.test.ts`, add cases for `renderSummaryPrompt`: empty/whitespace → `""` (or no block); non-empty → starts with `Resumo da conversa:\n` and includes text
- [X] T013 [P] [US1] In `src/http/server.test.ts`, add case: seed conversation with `upsertSummary` + enough messages; fake echoes `calls[0].message` → includes `Resumo da conversa:` and at most 8 history lines; `metrics.historyMessages` ∈ 1..8; `contextBreakdown.summary === estimateTokens` of the summary block (0 if none)
- [X] T014 [P] [US1] In `src/http/server.test.ts`, add case: two conversations — summary of A must not appear in echoed prompt of B; short thread (≤8 msgs, no summary) → no invented summary block

### Implementation for User Story 1

- [X] T015 [US1] Implement `renderSummaryPrompt` in `src/services/history-prompt.ts` per contracts (`Resumo da conversa:\n…`; blank → empty string)
- [X] T016 [US1] In `src/services/chat-service.ts`, before `strategy.run`: `getSummary` when `conversationId` present; compose prompt order memory → summary block → history (`HISTORY_LIMIT`); set `contextBreakdown.summary` via `estimateTokens(summaryBlock)` (always present with `history`/`memory`); keep `historyMessages = window.length` (0–8)
- [X] T017 [US1] Confirm blank-input path keeps `historyMessages: 0` and `contextBreakdown.summary: 0` with no store summary read side effects that invent content
- [X] T018 [US1] Run US1 tests + `npm run typecheck` until green

**Checkpoint**: MVP — janela 8 + resumo no contexto (resumo pode ser seedado no store)

---

## Phase 4: User Story 2 - Resumir em lote, não a cada pedido (Priority: P1)

**Goal**: Após append no 200, consolidar só quando `listUnsummarizedOutsideWindow(..., 8, covered).length >= 8`; merge via `ConversationSummarizer`; `upsertSummary`; soft-fail preserva resumo; sem consolidação em vazio/4xx/504.

**Independent Test**: Fake summarizer call-count: 0 until 8th pending egress; exactly 1 on that turn with `egressBatch.length === 8` and `previousSummary`; later turns 0 until next batch; failed summarizer leaves prior summary unchanged.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [P] [US2] In `src/agents/conversation-summarizer.test.ts` (or chat-service test), document fake that records calls and returns deterministic text including prior+batch size
- [X] T020 [P] [US2] In `src/http/server.test.ts`, drive turns with fake strategy + fake summarizer until 16 messages (8 outside window): assert summarizer call count stays 0 before the closing turn, becomes 1 on that turn, and `getSummary` text matches fake output with `coveredThroughId` = last batch id
- [X] T021 [P] [US2] In `src/http/server.test.ts`, after first consolidation, more turns with pending &lt; 8 → call count unchanged; on next full batch → second call with non-empty `previousSummary`
- [X] T022 [P] [US2] In `src/http/server.test.ts` (or store+service), fake summarizer throws or returns whitespace → prior summary unchanged; turn still 200; blank/404 paths never call summarizer

### Implementation for User Story 2

- [X] T023 [US2] Implement `createLlmConversationSummarizer` in `src/agents/conversation-summarizer.ts`: prompt merges `previousSummary` + 8 egress messages; preserve decisões/fatos/pendências; target ~150 tokens (~600 chars chars÷4); return string
- [X] T024 [US2] In `src/services/chat-service.ts`, after successful user+assistant append: compute pending via `listUnsummarizedOutsideWindow(id, 8, covered)`; if `length >= 8`, `await (conversationSummarizer ?? createLlmConversationSummarizer()).summarize({ previousSummary: existing?.text ?? "", egressBatch: pending.slice(0, 8) })`; on non-blank success → `upsertSummary(id, text, batch[7].id)`; on throw/blank → `console.error` with `[history-summarizer]`, no upsert
- [X] T025 [US2] Ensure empty message / 400 / 422 / 404 / 504 paths never invoke summarizer or mutate summaries
- [X] T026 [US2] Run US2 tests + `npm run typecheck` until green

**Checkpoint**: Lote de 8 dispara merge+persistência; requests intermediários não

---

## Phase 5: User Story 3 - Observar a consolidação no rastro (Priority: P2)

**Goal**: Turno que consolida com sucesso inclui `{ type: "summarize", content }` no `trace`; turnos sem consolidação não inventam o evento.

**Independent Test**: Same harness as US2 — closing-batch 200 has `summarize` in `trace`; incomplete-batch 200 does not; soft-fail does not.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T027 [P] [US3] In `src/http/server.test.ts`, assert consolidating turn’s `trace` includes exactly one event with `type === "summarize"` and `content` equal to upserted summary text
- [X] T028 [P] [US3] In `src/http/server.test.ts`, assert non-consolidating 200 and soft-fail paths have zero `summarize` events

### Implementation for User Story 3

- [X] T029 [US3] In `src/services/chat-service.ts`, after successful `upsertSummary`, append `{ type: "summarize", content: newText }` to the returned `trace` (after strategy trace); do not append on soft-fail or when pending &lt; 8
- [X] T030 [US3] Confirm `src/http/server.ts` serializes `trace` as-is (no filter stripping `summarize`)
- [X] T031 [US3] Run US3 tests + `npm run typecheck` until green

**Checkpoint**: Evento `summarize` observável só na consolidação bem-sucedida

---

## Phase 6: User Story 4 - Conferência com substituto fake (Priority: P1)

**Goal**: Suíte `:memory:` + fakes cobre janela, gatilho, merge, persistência, contexto e `summarize`; typecheck/test verdes; arena/bench intocados.

**Independent Test**: `npm test` + `npm run typecheck` green without OpenRouter; no arena/bench changes required.

### Tests for User Story 4 ⚠️

- [X] T032 [P] [US4] Audit/add any missing coverage gaps in `src/store/sqlite-conversation-store.test.ts` and `src/http/server.test.ts` listed in `quickstart.md` §1 (sem resumo, lote incompleto, lote fecha, resumo no eco, isolamento)
- [X] T033 [P] [US4] Ensure silent/default fakes in `src/http/server.test.ts` inject `conversationSummarizer` where needed so suite never calls real LLM summarizer

### Implementation for User Story 4

- [X] T034 [US4] Verify arena (`src/arena.ts`) and bench (`src/bench.ts`) still do not wire conversation summarization (FR-012); no code changes unless accidental coupling
- [X] T035 [US4] Run full `npm run typecheck` and `npm test` until green

**Checkpoint**: Regressão fake completa; constituição V satisfeita

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Alinhamento final com quickstart e contratos

- [X] T036 [P] Walk `specs/011-sumarizacao-historico/quickstart.md` checklist against implemented behavior; fix gaps in tests or composition if any
- [X] T037 [P] Confirm `contextBreakdown` always includes `summary` key (0 when absent) in all 200 metric paths including blank, per `contracts/chat-http.md`
- [X] T038 Final `npm run typecheck` && `npm test` green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP (resumo seedado + janela 8)
- **US2 (Phase 4)**: After Foundational; practically after US1 composition (same `chat-service.ts` — sequential recommended)
- **US3 (Phase 5)**: After US2 (needs consolidation path to emit event)
- **US4 (Phase 6)**: After US1–US3 behavior exists
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — can demo with `upsertSummary` seed
- **US2 (P1)**: Foundational + benefits from US1 prompt order; shares `chat-service.ts`
- **US3 (P2)**: Depends on US2 consolidation success path
- **US4 (P1)**: Cross-cutting validation of US1–US3

### Within Each User Story

- Tests first (fail) → implementation → typecheck/test green
- Store/types before service wiring
- Soft-fail and empty/4xx paths before claiming done

### Parallel Opportunities

- T001–T003 (Setup) in parallel
- T008–T009 in parallel after types started; T010 after T007
- T012–T014 (US1 tests) in parallel; T019–T022 (US2 tests) in parallel; T027–T028 in parallel
- T032–T033 in parallel
- T036–T037 in parallel
- US1 vs early US2 test authoring can overlap; **implementation** on `chat-service.ts` should be sequential (US1 → US2 → US3)

---

## Parallel Example: User Story 1

```bash
# Tests in parallel:
Task: "T012 renderSummaryPrompt cases in src/services/history-prompt.test.ts"
Task: "T013 HTTP echo with seeded summary in src/http/server.test.ts"
Task: "T014 isolation / short-thread cases in src/http/server.test.ts"

# Then implementation sequential on shared files:
Task: "T015 implement renderSummaryPrompt"
Task: "T016 wire chat-service composition + breakdown.summary"
```

---

## Parallel Example: User Story 2

```bash
# Tests in parallel:
Task: "T020 first-batch call count in src/http/server.test.ts"
Task: "T021 second-batch previousSummary in src/http/server.test.ts"
Task: "T022 soft-fail / no-call paths in src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (limit 8 + store summaries)
3. Phase 3 US1 — summary in context with seeded row
4. **STOP and VALIDATE** US1 independent test
5. Then US2 (auto consolidate) → US3 (event) → US4 (full fake suite)

### Incremental Delivery

1. Setup + Foundational → window 8 + summary persistence API
2. US1 → prompt shows summary + 8 raw messages
3. US2 → batch consolidate without per-request cost
4. US3 → `summarize` visible in `trace`
5. US4 + Polish → green suite / quickstart

### Parallel Team Strategy

1. Together: Setup + Foundational
2. Dev A: US1 composition tests+impl
3. Dev B: US2 summarizer + trigger tests (merge after US1 touches `chat-service`)
4. Dev C: US3/US4 assertions once US2 lands

---

## Notes

- [P] = different files, no incomplete-task dependency
- Same-file conflicts: `chat-service.ts`, `server.test.ts`, `sqlite-conversation-store.ts` — avoid parallel writes
- First consolidation typically at ≥16 persisted messages (8 outside + 8 in window)
- Arena/bench out of scope (FR-012)
- Commit after each task or logical group (constituição VIII)

