# Tasks: Refletor de aprendizado

**Input**: Design documents from `/specs/009-refletor-aprendizado/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-014 / SC-001…SC-007 / US4 e constituição princípio V exigem conferência com stub, `:memory:` e não-bloqueio.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueletos dos módulos novos (plan.md / research.md Decisões 1, 6) sem alterar o fluxo do `/chat` ainda

- [X] T001 [P] Create `src/agents/learning-extractor.ts` exporting `type LearningDecision = { hasLearning: boolean; fact: string }`, `type LearningExtractor = { extract(userMessage: string): Promise<LearningDecision> }`, Zod schema stub `learningDecisionSchema`, constant `LEARNING_EXTRACTOR_PROMPT` (string placeholder), and `createLlmLearningExtractor()` that throws `Error("not implemented")`
- [X] T002 [P] Create `src/services/learning-reflector.ts` exporting stubs `shouldRemember(decision: LearningDecision): string | null` and `scheduleLearning(args: { userId: string; userMessage: string; memoryStore: MemoryStore; extractor: LearningExtractor }): void` that throw `Error("not implemented")` (import types from learning-extractor / domain)
- [X] T003 [P] Create empty test shells with `node:test` + `node:assert/strict`: `src/services/learning-reflector.test.ts`, `src/agents/learning-extractor.test.ts` (can start with a single `test.todo` or empty import of modules under test)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, erro de domínio, gate puro e contrato do extrator. Sem wire em `runChat` / tools nesta fase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Add `UserIdRequiredError` extending `DomainError` in `src/domain/errors.ts` with a stable Portuguese message stating that `userId` is required for the memory preference tool (used later by `forget_preference`)
- [X] T005 [P] Implement pure `shouldRemember` in `src/services/learning-reflector.ts` per `data-model.md` / `contracts/learning-reflector.md`: `hasLearning === false` → `null` (ignore any `fact`); `hasLearning === true` and `fact.trim() === ""` → `null`; else → `fact.trim()`
- [X] T006 [P] Write pure cases in `src/services/learning-reflector.test.ts` for `shouldRemember`: false+filled fact → null; true+`""`/`"   "` → null; true+`"  cluster azul  "` → `"cluster azul"`
- [X] T007 Flesh out `src/agents/learning-extractor.ts`: export `learningDecisionSchema = z.object({ hasLearning: z.boolean(), fact: z.string() })`; set `LEARNING_EXTRACTOR_PROMPT` documenting durable vs one-off vs secret and max one fact (contracts/learning-reflector.md); implement `createLlmLearningExtractor()` using `createModel().withStructuredOutput(learningDecisionSchema)` and system+user messages like `critic.ts` (may be unused until production path)
- [X] T008 Run `npm run typecheck` and `npm test -- src/services/learning-reflector.test.ts` until green

**Checkpoint**: Gate puro e extrator tipados — US1 pode agendar aprendizado

---

## Phase 3: User Story 1 - Aprender fato durável após a resposta (Priority: P1) 🎯 MVP

**Goal**: Após `/chat` bem-sucedido com `userId`, o refletor extrai e chama *remember* assíncrono; dedup/isolamento ficam no MemoryStore 008.

**Independent Test**: Stub `LearningExtractor` com `hasLearning: true` + fato; `runChat`/`POST /chat` com `userId` e store `:memory:` → após microtask o fato aparece no *recall*; resposta não espera o *remember*.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [P] [US1] In `src/services/learning-reflector.test.ts`, add `scheduleLearning` cases with fake `MemoryStore`: when extractor returns durable decision, `remember` is eventually called with trimmed fact and same `userId`; when `shouldRemember` would be null, `remember` never called; extractor throw is swallowed (no unhandled rejection — use `await` of a short delay / `setImmediate` and assert process continues)
- [X] T010 [P] [US1] In `src/http/server.test.ts` (or `src/services/chat-service` focused test if cleaner), add case: `createApp` with `learningExtractor` stub (durable), `SqliteMemoryStore(":memory:", fakeEmbedder)`, fake strategy registry; POST `/chat` with `userId` + message → 200; then flush microtasks and `recall` finds the stub fact; POST without `userId` → extractor **not** called (spy/counter on stub)

### Implementation for User Story 1

- [X] T011 [US1] Implement `scheduleLearning` in `src/services/learning-reflector.ts`: fire-and-forget `void (async () => { … })().catch(err => console.error("[learning-reflector]", err))`; inside: `extract` → `shouldRemember` → optional `memoryStore.remember`; never rethrow to caller
- [X] T012 [US1] Extend `RunChatInput` / `runChat` in `src/services/chat-service.ts`: accept `learningExtractor?: LearningExtractor` (default `createLlmLearningExtractor()` only when scheduling, or inject default at call site); on successful path **after** conversation append and **before** `return`, if `userId` defined call `scheduleLearning({ userId, userMessage: input.message, memoryStore, extractor })` without await; blank-input / timeout / thrown path MUST NOT schedule; pass `userId` + `memoryStore` into `strategy.run` options now only if already needed — if not yet for US3, skip options until US3
- [X] T013 [US1] Extend `CreateAppOptions` in `src/http/server.ts` with `learningExtractor?: LearningExtractor` and pass through to `runChat`
- [X] T014 [US1] Run `npm test` for learning-reflector + server cases covering US1, plus `npm run typecheck`, until green

**Checkpoint**: MVP — fato durável do stub vira memória após a resposta

---

## Phase 4: User Story 2 - Ignorar pedido pontual e segredo (Priority: P1)

**Goal**: Extrator/stub classifica pontual e segredo como `hasLearning: false`; nada é gravado; mensagem mista só pode gravar o fato durável (texto limpo).

**Independent Test**: Fixtures pontual/segredo → zero inserts; fixture mista com stub que devolve só o fato limpo → um remember sem o pedido/segredo.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T015 [P] [US2] In `src/services/learning-reflector.test.ts` (or `src/http/server.test.ts`), add fixtures: stub returning `{ hasLearning: false, fact: "" }` for one-off and for secret → after `scheduleLearning` / chat, memory COUNT unchanged; stub for mixed message returning `{ hasLearning: true, fact: "Prefiro o cluster azul" }` without secret/one-off text → exactly one remember with that fact only
- [X] T016 [P] [US2] In `src/agents/learning-extractor.test.ts`, assert `LEARNING_EXTRACTOR_PROMPT` mentions (case-insensitive or substring) durable learning, one-off/pedido pontual, and secret/credencial/token guidance so the production prompt cannot silently drop FR-006/FR-007

### Implementation for User Story 2

- [X] T017 [US2] Finalize `LEARNING_EXTRACTOR_PROMPT` in `src/agents/learning-extractor.ts` so it explicitly forbids persisting one-off ops requests and secrets, and instructs max-one durable fact for mixed messages (align with contracts/learning-reflector.md)
- [X] T018 [US2] Ensure `scheduleLearning` + `shouldRemember` already skip `hasLearning: false` even if `fact` is non-empty; add regression assert in `src/services/learning-reflector.test.ts` if missing from T006
- [X] T019 [US2] Run the US2 tests and `npm run typecheck` until green

**Checkpoint**: Pontual/segredo não entram na memória; prompt documenta as regras

---

## Phase 5: User Story 3 - Esquecer preferência via ferramenta (Priority: P2)

**Goal**: Tool `forget_preference` no inventário Ops; localiza via *recall* (≥ 0,3) e remove com *forget*; sem `userId` falha previsível.

**Independent Test**: Store com fato → tool com description alinhada → `{ forgotten: true }` e recall vazio; miss → `{ forgotten: false }`; sem userId → observação de erro, store intacto.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T020 [P] [US3] Extend `src/agents/tools.test.ts`: with `createOpsTools(store, { memoryStore, userId })`, `forget_preference` hit (pre-*remember* fact, description that fake embedder ranks ≥ 0.3) → JSON `forgotten: true` with `id`/`fact`, and subsequent *recall* omits it; miss (no facts / low score) → `forgotten: false` and COUNT unchanged; omit `userId` or `memoryStore` → observation contains `UserIdRequiredError` message (or stable text), no deletes; assert tool is registered in the tools array (count becomes 7; update existing “6 tools” assertion)
- [X] T021 [P] [US3] Add/adjust trace typing expectation: `ToolName` includes `"forget_preference"` in `src/agents/strategy.ts` (compile-level; fix any exhaustive switches/tests that list tool names)

### Implementation for User Story 3

- [X] T022 [US3] Extend `StrategyOptions` in `src/agents/strategy.ts` with `userId?: string` and `memoryStore?: MemoryStore`; extend `ToolName` union with `"forget_preference"`
- [X] T023 [US3] Implement `forget_preference` in `src/agents/tools.ts` per `contracts/forget-preference.md`: schema `{ description: z.string().trim().min(1) }`; missing context → `asObservation(new UserIdRequiredError(…))`; else `recall` → empty → `JSON.stringify({ forgotten: false })`; else `forget(userId, top.id)` → `JSON.stringify({ forgotten: true, id, fact })`; append tool to returned `tools` array; thread `deps.memoryStore` / `deps.userId`
- [X] T024 [US3] In `src/agents/react.ts` and `src/agents/plan-and-execute.ts`, pass `{ memoryStore: options.memoryStore, userId: options.userId }` into `createOpsTools`
- [X] T025 [US3] In `src/services/chat-service.ts`, pass `userId` and `memoryStore` into `strategy.run` `StrategyOptions` when calling the strategy (so the tool has context during the turn)
- [X] T026 [US3] Run `npm test -- src/agents/tools.test.ts` (and any strategy/trace tests broken by ToolName) plus `npm run typecheck` until green

**Checkpoint**: Plantonista consegue esquecer preferência via tool escopada

---

## Phase 6: User Story 4 - Conferir refletor sem travar o plantão (Priority: P2)

**Goal**: Suíte prova não-bloqueio, falha async não reabre o turno, fixtures durável/pontual/segredo, e regressão sem `userId`.

**Independent Test**: Remember deferred resolve after `runChat` returns; rejected remember still yields answer; full quickstart table cases green with `:memory:`.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T027 [P] [US4] In `src/services/learning-reflector.test.ts` or chat-service test: wrap MemoryStore so `remember` returns a Promise controlled by the test; assert `runChat` / `scheduleLearning` caller completes **before** `resolveRemember()`; after resolve, fact is present
- [X] T028 [P] [US4] Same harness: `remember` rejects → chat/schedule path still returns success answer; no throw to client; optionally spy `console.error` was called with `[learning-reflector]`
- [X] T029 [P] [US4] Confirm in `src/http/server.test.ts` that blank message + `userId` still short-circuits without calling extractor; invalid `userId` still 400 without scheduling

### Implementation for User Story 4

- [X] T030 [US4] Fix any race/ordering gaps so T027–T029 pass (e.g. ensure schedule is after append but never awaited; blank path skips schedule)
- [X] T031 [US4] Run full `npm test` and `npm run typecheck` until green for the feature suite

**Checkpoint**: Conferência do quickstart coberta sem LLM de chat externo

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Regressões arena/bench e validação final

- [X] T032 [P] Assert in an existing or new colocated test (e.g. extend `src/memory/memory-scope.test.ts` or add `src/services/learning-reflector` scope check) that `src/arena.ts` and `src/bench.ts` source still do not import `scheduleLearning` / `learning-extractor` / `forget_preference` wiring as required flow
- [X] T033 Run the validation matrix from `specs/009-refletor-aprendizado/quickstart.md` via `npm test` + `npm run typecheck`; fix any remaining failures
- [X] T034 [P] Skim contracts vs code: `contracts/learning-reflector.md`, `contracts/forget-preference.md`, `contracts/chat-http.md` — adjust code or contract notes only if drift found (no new HTTP fields)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational; practically after US1 schedule exists (shares `scheduleLearning`)
- **US3 (Phase 5)**: After Foundational; can start in parallel with US1/US2 on tools files, but `chat-service` options wiring should land after or with US1 touch of `runChat`
- **US4 (Phase 6)**: After US1 schedule path exists (needs fire-and-forget); ideally after US2 fixtures
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP
- **US2 (P1)**: Needs `scheduleLearning` + stubs from US1 foundation; independently testable with fixtures
- **US3 (P2)**: Mostly independent (tools + StrategyOptions); needs `runChat` to pass options for e2e
- **US4 (P2)**: Hardens US1/US2 async guarantees

### Within Each User Story

- Tests first (fail), then implementation, then typecheck/test green
- Pure gate before I/O schedule
- Tool before strategy wiring

### Parallel Opportunities

- T001–T003 in parallel
- T005–T006 in parallel after T004 (or T006 after T005)
- T009–T010 in parallel
- T015–T016 in parallel
- T020–T021 in parallel
- T027–T029 in parallel
- After Foundational: US3 tools work can overlap US1 chat wiring if different owners coordinate `chat-service.ts`

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "T009 scheduleLearning cases in src/services/learning-reflector.test.ts"
Task: "T010 POST /chat durable stub in src/http/server.test.ts"

# Then implementation (sequential on shared chat path):
Task: "T011 scheduleLearning in src/services/learning-reflector.ts"
Task: "T012 wire runChat in src/services/chat-service.ts"
Task: "T013 createApp learningExtractor in src/http/server.ts"
```

---

## Parallel Example: User Story 3

```bash
Task: "T020 forget_preference cases in src/agents/tools.test.ts"
Task: "T021 ToolName forget_preference in src/agents/strategy.ts"
# then
Task: "T023 implement forget_preference in src/agents/tools.ts"
Task: "T024 react + plan-and-execute deps"
Task: "T025 runChat StrategyOptions"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (schedule + chat wire + stub durable)  
4. **STOP and VALIDATE** — fato aparece após resposta  
5. Demo MVP

### Incremental Delivery

1. Setup + Foundational  
2. US1 → durable remember async (MVP)  
3. US2 → pontual/segredo blocked  
4. US3 → `forget_preference`  
5. US4 → non-blocking + failure isolation  
6. Polish → arena/bench + quickstart matrix

### Parallel Team Strategy

1. Together: Setup + Foundational  
2. Dev A: US1 + US4 async  
3. Dev B: US2 fixtures/prompt  
4. Dev C: US3 tool + StrategyOptions (merge carefully on `chat-service.ts` / `tools.ts`)

---

## Notes

- [P] = different files, no dependency on incomplete sibling tasks
- Reuse MemoryStore 008 — **no** new SQLite DDL
- HTTP body/response unchanged — learning is a side effect
- Do not confuse with `src/agents/reflection.ts` (critique layer)
- Commit after each task or logical group; keep `typecheck` + `test` green at checkpoints

