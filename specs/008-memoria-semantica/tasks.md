# Tasks: Memória semântica

**Input**: Design documents from `/specs/008-memoria-semantica/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-013 / SC-003 / US4 exigem ensaio semântico e conferência em `:memory:`; constituição princípio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependência de embeddings e esqueletos sob `src/memory/` (plan.md / research.md Decisão 2–3)

- [X] T001 Add `@huggingface/transformers` to `package.json` dependencies via `npm install @huggingface/transformers` (keep existing LangChain/Express/Zod versions)
- [ ] T002 [P] Create `src/memory/embeddings.ts` exporting `type Embedder = { embed(text: string): Promise<Float32Array> }`, stub `createTransformersEmbedder` / `getDefaultEmbedder` that throw `Error("not implemented")`
- [ ] T003 [P] Create `src/memory/similarity.ts` exporting stubs `dot`, `shouldDedup`, `rankRecall` that throw `Error("not implemented")`, plus constants `DEDUP_THRESHOLD = 0.92`, `RECALL_MIN_SCORE = 0.3`, `RECALL_TOP_K = 3`, `EMBEDDING_DIMS = 384`
- [ ] T004 [P] Create `src/memory/memory-store.ts` exporting `class SqliteMemoryStore` with `constructor(path?: string, embedder?: Embedder)` defaulting path to `process.env.OPSPILOT_DB ?? "./data/opspilot.db"`; methods may throw `Error("not implemented")`
- [ ] T005 [P] Create empty test shells importing `node:test` and `node:assert/strict`: `src/memory/similarity.test.ts`, `src/memory/memory-store.test.ts`, `src/memory/embeddings.test.ts`, `src/services/memory-prompt.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos e erros de domínio que US1–US4 usam. Sem SQL de `memories` e sem mudança de rota nesta fase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Add to `src/domain/types.ts` per `data-model.md` / `contracts/memory-store.md`: `MemoryRecord = { id: string; userId: string; fact: string; createdAt: number }`; `RecalledMemory = MemoryRecord & { score: number }`; `Embedder = { embed(text: string): Promise<Float32Array> }`; `MemoryStore` with `remember(userId: string, fact: string): Promise<MemoryRecord>`, `recall(userId: string, query: string): Promise<RecalledMemory[]>`, `forget(userId: string, memoryId: string): void`
- [ ] T007 [P] Add `InvalidMemoryInputError`, `MemoryNotFoundError`, and `EmbeddingUnavailableError` extending `DomainError` in `src/domain/errors.ts`
- [ ] T008 Implement pure helpers in `src/memory/similarity.ts`: `dot(a: Float32Array, b: Float32Array): number` (produto interno); `shouldDedup(score: number): boolean` true iff `score > 0.92` (strict greater than `DEDUP_THRESHOLD`); `rankRecall(candidates: { id: string; createdAt: number; score: number }[]): …` filters `score >= 0.3`, sorts score DESC then `createdAt` ASC then `id` ASC, returns at most 3. No I/O
- [ ] T009 [P] Write pure cases in `src/memory/similarity.test.ts`: orthogonal unit vectors → `dot` 0; identical → ~1; `shouldDedup(0.92)` false and `shouldDedup(0.9201)` true; ranking drops `< 0.3`, keeps top 3, stable tie-break on equal score
- [ ] T010 Run `npm run typecheck` and `npm test -- src/memory/similarity.test.ts` until green

**Checkpoint**: Foundation ready — embeddings, store e canal podem começar

---

## Phase 3: User Story 1 - Guardar um fato do plantonista (Priority: P1) 🎯 MVP

**Goal**: *remember* grava fato + embedding por `userId`; dedup se similaridade **> 0,92**; isolamento entre usuários.

**Independent Test**: Com embedder fake e `SqliteMemoryStore(":memory:")`, lembrar um fato, reler via *recall* (ou inspeção SQL), lembrar quase-duplicata sem segunda linha, e dois `userId` sem vazamento.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T011 [P] [US1] Write store *remember*/dedup/isolation cases in `src/memory/memory-store.test.ts` using `new SqliteMemoryStore(":memory:", fakeEmbedder)` only (no temp file): blank `userId` or `fact` (`""` / `"   "`) throws `InvalidMemoryInputError` and inserts nothing; *remember* returns `MemoryRecord` with non-empty `id`, same `userId`, raw `fact` (no trim of content beyond validation), and `createdAt`; second *remember* whose fake vectors yield `dot > 0.92` returns the **existing** id and `SELECT COUNT(*)` stays 1; second fact with `dot <= 0.92` inserts a second row; facts for `user-a` never appear when recalling/inspecting `user-b`; expose `readonly database` for COUNT asserts like other stores

### Implementation for User Story 1

- [ ] T012 [US1] Implement `SqliteMemoryStore` in `src/memory/memory-store.ts`: `mkdirSync` parent when path is not `:memory:`; `PRAGMA foreign_keys = ON`; `PRAGMA busy_timeout = 5000`; idempotent DDL `memories` (`id TEXT PRIMARY KEY`, `user_id TEXT NOT NULL`, `fact TEXT NOT NULL`, `embedding BLOB NOT NULL`, `created_at INTEGER NOT NULL`) + index `idx_memories_user_id (user_id)`; serialize embedding as little-endian Float32 `Buffer` (384 × 4 bytes); *remember* validates trim-nonempty, embeds, loads same-`user_id` rows, if any `dot > 0.92` return existing (highest score; tie: oldest `created_at` then `id`); else `crypto.randomUUID()` + `Date.now()` INSERT; prepared statements only; do not touch ops/conversation tables. Stub *recall*/*forget* may still throw until later stories if needed for compile — prefer minimal *recall* that returns all scored for US1 asserts, or assert via SQL COUNT/SELECT in tests
- [ ] T013 [US1] Implement lazy real embedder in `src/memory/embeddings.ts`: `createTransformersEmbedder` uses `pipeline("feature-extraction", modelId ?? "Xenova/all-MiniLM-L6-v2")` with call options `{ pooling: "mean", normalize: true }`, returns `Float32Array` length 384; `getDefaultEmbedder` lazy-singleton; wrap load/infer failures as `EmbeddingUnavailableError`. US1 store tests keep injecting fake — do not require model download for T011/T014
- [ ] T014 [US1] Run `npm test -- src/memory/memory-store.test.ts` and `npm run typecheck` until US1 cases are green

**Checkpoint**: MVP — fato persiste por `userId` com dedup e isolamento

---

## Phase 4: User Story 2 - Recuperar fatos relevantes no chat (Priority: P1)

**Goal**: `/chat` aceita `userId` opcional; *recall* top-3 com mínimo 0,3; bloco `Memória do plantonista` entra no prompt antes do histórico; sem `userId` = comportamento 007.

**Independent Test**: Fake embedder + store `:memory:` + `createApp` com substituto: POST com `userId` e fato prévio → fake recebe bloco de memória; sem `userId` → só histórico; `userId` inválido → 400.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T015 [P] [US2] Write *recall* cases in `src/memory/memory-store.test.ts`: returns at most 3, only `score >= 0.3`, ordered score DESC with stable ties; empty/blank query or userId → `InvalidMemoryInputError`; user with no facts → `[]`
- [ ] T016 [P] [US2] Write pure prompt cases in `src/services/memory-prompt.test.ts`: empty list → `""`; one/two facts → lines under header `Memória do plantonista:` with `- <fact>` bullets
- [ ] T017 [P] [US2] Add channel cases in `src/http/server.test.ts`: every memory-related `createApp` injects `memoryStore: new SqliteMemoryStore(":memory:", fakeEmbedder)` and `conversationStore: new SqliteConversationStore(":memory:")`; after *remember* via store, POST `{ message, userId }` → 200 and fake `run` input starts with `Memória do plantonista:` and contains the fact, then history (`Plantonista: …`); POST without `userId` → no memory header; `userId` number/`null`/`""`/`"   "` → 400 with `issues`, fake not called; blank message with valid `userId` → empty-input 200, no recall side effects on store counts; `historyMessages` still counts only conversation window (not memory lines)

### Implementation for User Story 2

- [ ] T018 [US2] Complete *recall* in `src/memory/memory-store.ts` per `contracts/memory-store.md`: embed query, score all facts for `userId`, filter/sort via `rankRecall`, return `RecalledMemory[]` without BLOB
- [ ] T019 [P] [US2] Implement `renderMemoryPrompt` in `src/services/memory-prompt.ts` per data-model (header + `- fact` lines; empty → `""`). No I/O
- [ ] T020 [US2] Extend `runChat` in `src/services/chat-service.ts`: accept `userId?: string` and `memoryStore: MemoryStore`; after blank-input short-circuit and conversation load, if `userId` present `await memoryStore.recall(userId, message)`, compose `memoryBlock ? memoryBlock + "\n\n" + history : history`, pass that string to `strategy.run`; do **not** call *remember*; keep conversation append behavior from 007; map embedding failures by letting `EmbeddingUnavailableError` propagate
- [ ] T021 [US2] In `src/http/server.ts`, add `userId: z.string().trim().min(1).optional()` to body schema; add `memoryStore?: MemoryStore` to `CreateAppOptions` defaulting to `new SqliteMemoryStore()`; pass into `runChat`; translate `EmbeddingUnavailableError` to a 5xx JSON with stable `message` (not 504); leave 400/422/404/504 bodies otherwise unchanged
- [ ] T022 [US2] Run `npm test` for `src/memory/memory-store.test.ts`, `src/services/memory-prompt.test.ts`, and `src/http/server.test.ts`, plus `npm run typecheck`, until US2 cases and existing channel tests are green

**Checkpoint**: Recall entra no prompt; canal sem `userId` permanece igual

---

## Phase 5: User Story 3 - Esquecer um fato (Priority: P2)

**Goal**: *forget* remove o fato no escopo `userId`+`id`; id ausente ou de outro usuário → `MemoryNotFoundError` sem efeitos colaterais.

**Independent Test**: Lembrar dois fatos, esquecer um, *recall* só devolve o restante; *forget* com id de outro `userId` não apaga nada.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [US3] Add *forget* cases in `src/memory/memory-store.test.ts`: after *forget*, *recall* omits that fact; second fact same user remains; wrong `userId` for an existing id throws `MemoryNotFoundError` and COUNT unchanged; unknown id throws `MemoryNotFoundError`; blank ids throw `InvalidMemoryInputError`

### Implementation for User Story 3

- [ ] T024 [US3] Implement `forget(userId, memoryId)` in `src/memory/memory-store.ts`: validate trim-nonempty; `DELETE … WHERE id = ? AND user_id = ?`; `changes === 0` → `MemoryNotFoundError`; else void
- [ ] T025 [US3] Run `npm test -- src/memory/memory-store.test.ts` until US3 cases are green

**Checkpoint**: Esquecer é previsível e isolado por usuário

---

## Phase 6: User Story 4 - Conferir memória sem arquivo e sem rede de chat (Priority: P2)

**Goal**: Suíte prova store + canal com `:memory:` e substituto; ensaio SC-003 com modelo real acha fato sem palavra em comum; arena/bench sem MemoryStore no fluxo.

**Independent Test**: `npm test` + `npm run typecheck` verdes; um teste de embeddings com timeout generoso; `src/arena.ts` / `src/bench.ts` não passam a exigir `userId`/MemoryStore.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T026 [US4] Add semantic case in `src/memory/embeddings.test.ts` (or store test with real embedder): *remember* fact `o cluster de pagamentos é o azul` for a user; *recall* query `qual cor do ambiente de payments?`; assert returned fact includes the remembered text, `score >= 0.3`, and that fact/query share **no** common word (tokenize/split helper in the test); use generous timeout; skip or document cache if environment forbids download — prefer always-on with long timeout matching quickstart
- [ ] T027 [P] [US4] Confirm in a small assert or comment-backed check that `src/arena.ts` and `src/bench.ts` do not import `SqliteMemoryStore` / `memory-prompt` / require `userId` (no behavior change). Add a regression note in `src/http/server.test.ts` if needed that omitted `userId` keeps 007 history-only prompt

### Implementation for User Story 4

- [ ] T028 [US4] Wire production defaults: ensure `src/index.ts` / `createApp()` path constructs `SqliteMemoryStore()` without breaking existing boot; no arena/bench edits unless typecheck forces unused imports cleanup
- [ ] T029 [US4] Run full `npm test` and `npm run typecheck` until green per `quickstart.md` table (cases 1–14)

**Checkpoint**: SC-003 e regressão do canal cobertos; feature conferível sem LLM de chat externo

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento da feature

- [ ] T030 [P] Re-read `specs/008-memoria-semantica/quickstart.md` and tick that automated rows match the suite (fix gaps only if a listed case is missing)
- [ ] T031 Run final `npm test` + `npm run typecheck`; confirm no secrets committed and new code does not read `.env` for memory logic

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP (*remember* + dedup)
- **US2 (Phase 4)**: After US1 store *remember* exists (needs rows to recall); can parallelize prompt pure work with store *recall*
- **US3 (Phase 5)**: After US1 (needs *remember*); independent of HTTP
- **US4 (Phase 6)**: After US1–US3 behaviors exist for full quickstart coverage
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP
- **US2 (P1)**: Needs US1 *remember* + embedder injection for channel tests; prompt pure (T016/T019) can start after Foundational
- **US3 (P2)**: Needs US1; no dependency on US2 HTTP
- **US4 (P2)**: Needs US1–US3 + real embedder path from T013

### Within Each User Story

- Tests first (fail), then implementation, then green gate
- Pure similarity before store; store before chat wiring
- Story complete before next priority when staffing is serial

### Parallel Opportunities

- Phase 1: T002–T005 in parallel after T001
- Phase 2: T007 parallel with T006; T009 after T008
- US1: T011 before T012–T014
- US2: T015, T016, T017 in parallel; T019 parallel with T018
- US3: after US1
- US4: T026 after real embedder; T027 parallel with docs/regressions

---

## Parallel Example: User Story 2

```bash
# Tests in parallel:
Task: "Write recall cases in src/memory/memory-store.test.ts"
Task: "Write memory-prompt cases in src/services/memory-prompt.test.ts"
Task: "Add channel userId cases in src/http/server.test.ts"

# Then implementation:
Task: "Complete recall in src/memory/memory-store.ts"
Task: "Implement renderMemoryPrompt in src/services/memory-prompt.ts"
Task: "Wire runChat + server.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (deps + skeletons)
2. Phase 2 Foundational (types, errors, similarity)
3. Phase 3 US1 (*remember* + dedup + fake embedder tests)
4. **STOP and VALIDATE** store independently

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → MemoryStore usable → MVP
3. US2 → `/chat` injects recall → demo plantão com memória
4. US3 → *forget*
5. US4 → ensaio semântico + suite completa
6. Polish → quickstart + typecheck/test finais

### Parallel Team Strategy

1. Together: Setup + Foundational
2. Then: A → US1/US3 store; B → memory-prompt + chat HTTP (US2) once *remember* API exists; C → SC-003 embeddings test (US4)

---

## Notes

- [P] = different files, no incomplete-task dependency
- Dedup threshold is **strictly greater than** 0.92 (`score > 0.92`)
- Module file is `memory-store.ts` (not `memory-story.ts`)
- No HTTP CRUD for remember/forget in this feature
- Commit after each task or logical group; keep `typecheck` + `test` green at story checkpoints
