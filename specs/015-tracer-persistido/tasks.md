# Tasks: Tracer persistido e logs JSON

**Input**: Design documents from `/specs/015-tracer-persistido/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — Independent Tests das US1–US5; constituição princípio V; FR-009; contratos `chat-http.md` / `get-request-http.md` / `request-store.md` / `logger.md`; quickstart sem rede.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de pastas/arquivos da feature; sem mudar comportamento de produção ainda

- [X] T001 [P] Create directory `src/obs/` and stub `src/obs/logger.ts` exporting a placeholder `createLogger` (or equivalent) that throws `Error("not implemented")` so imports resolve
- [X] T002 [P] Create stub `src/store/sqlite-request-store.ts` exporting class `SqliteRequestStore` with constructor accepting `path?: string` defaulting to `process.env.OPSPILOT_DB ?? "./data/opspilot.db"` (body may throw `not implemented`)
- [X] T003 [P] Create placeholder test files `src/obs/logger.test.ts` and `src/store/sqlite-request-store.test.ts` with `node:test` `test.todo` entries referencing `contracts/logger.md` and `contracts/request-store.md`
- [X] T004 Confirm no new npm dependency is required (`node:crypto`, `node:sqlite`, Express, Zod already in stack); do not add packages to `package.json`

**Checkpoint**: Stubs e todos existem; typecheck do restante intacto se stubs não forem importados pela app ainda

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Erro de domínio, tipos `RequestStore`, schema SQLite `requests`/`trace_events` e API save/get — bloqueia US2–US4 (e sustenta US5)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Add `RequestNotFoundError` class in `src/domain/errors.ts` extending `DomainError` with default message exactly `Request não encontrado.`
- [X] T006 [P] Add domain types in `src/domain/types.ts` (or colocated next to store if project prefers): `SavedRequest` with `requestId: string`, `createdAt: number` (epoch ms), `metrics` object, `trace: TraceEvent[]`; and `RequestStore` with `save(input: { id: string; createdAt: number; metrics: SavedRequest["metrics"]; trace: TraceEvent[] }): void` and `getById(id: string): SavedRequest | null` per `data-model.md` and `contracts/request-store.md`
- [X] T007 Implement `SqliteRequestStore` in `src/store/sqlite-request-store.ts`: open `DatabaseSync`, `PRAGMA foreign_keys = ON`, create tables exactly — `requests(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, metrics_json TEXT NOT NULL)` and `trace_events(id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL REFERENCES requests(id), seq INTEGER NOT NULL, node TEXT, type TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(request_id, seq))` plus index `trace_events_request_id_seq` on `(request_id, seq)`; path `:memory:` skips mkdir; file path uses `mkdirSync(dirname)` like `SqliteConversationStore`
- [X] T008 Implement `save` in `src/store/sqlite-request-store.ts` inside a transaction: insert `requests`; for each trace event index `i` insert `trace_events` with `seq=i`, `type=event.type`, `node=event.node ?? null`, `payload=JSON.stringify(event)` (full TraceEvent); empty trace allowed
- [X] T009 Implement `getById` in `src/store/sqlite-request-store.ts`: missing request → `null`; else parse `metrics_json`, load events `ORDER BY seq ASC`, parse each `payload` into `trace`
- [X] T010 Replace todos in `src/store/sqlite-request-store.test.ts` with cases: save+get round-trip with metrics + ordered multi-event trace; empty trace; unknown id → `null`; run `node --import tsx --test src/store/sqlite-request-store.test.ts` until green
- [X] T011 Run `npm run typecheck` until green after T005–T010

**Checkpoint**: Store e erro de domínio prontos — stories podem wirear HTTP/logger

---

## Phase 3: User Story 1 - Correlacionar cada turno de chat por requestId (Priority: P1) 🎯 MVP

**Goal**: Todo `POST /chat` (após schema ok) expõe `requestId` UUID no JSON 200 e no header `X-Request-Id` (mesmo valor); ids distintos por request; header presente em erros de domínio após o id ser gerado.

**Independent Test**: `createApp` + registry fake: 200 tem corpo.`requestId` === header `X-Request-Id`; dois POSTs → ids diferentes; 422/504/503 após id → header presente.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] In `src/http/server.test.ts`, add failing case: successful `POST /chat` → JSON `requestId` is non-empty string and equals response header `X-Request-Id` per `contracts/chat-http.md`
- [X] T013 [P] [US1] In `src/http/server.test.ts`, add failing case: two successful `POST /chat` calls yield two distinct `requestId` values
- [X] T014 [P] [US1] In `src/http/server.test.ts`, add failing case: after schema-valid body, domain error path (e.g. unknown strategy 422 or fake timeout 504) still returns header `X-Request-Id` with a non-empty value

### Implementation for User Story 1

- [X] T015 [US1] In `src/http/server.ts` `POST /chat` handler: after successful Zod body parse, generate `requestId` with `randomUUID()` from `node:crypto`, call `res.setHeader("X-Request-Id", requestId)` before `runChat`; include `requestId` in the 200 JSON alongside `answer` / `trace` / `metrics` / `conversationId?`
- [X] T016 [US1] Ensure error branches after id generation in `src/http/server.ts` keep the `X-Request-Id` header already set (do not clear it); 400 schema failures before id remain without mandatory header
- [X] T017 [US1] Run US1 tests in `src/http/server.test.ts` + `npm run typecheck` until green

**Checkpoint**: MVP — plantonista correlaciona o turno pelo id na borda HTTP

---

## Phase 4: User Story 2 - Persistir métricas do request e eventos de trace (Priority: P1)

**Goal**: Após `runChat` bem-sucedido (incl. pedido em branco), persistir `requests` + `trace_events` **antes** do 200; reinício com mesmo DB ainda lê o registro.

**Independent Test**: App com `SqliteRequestStore(":memory:")` injetado; após `/chat` 200, `store.getById(requestId)` tem metrics coerentes e N eventos com node/payload na ordem do `trace`.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T018 [P] [US2] In `src/http/server.test.ts`, add failing case: inject `requestStore: new SqliteRequestStore(":memory:")`; after 200 with multi-event fake trace, `getById` returns one request whose `metrics` match JSON and `trace.length` equals response trace, same order
- [X] T019 [P] [US2] In `src/http/server.test.ts`, add failing case: blank-message 200 still persists a request row (trace may be minimal/non-empty per `buildEmptyInputResult`); `getById` succeeds

### Implementation for User Story 2

- [X] T020 [US2] Extend `CreateAppOptions` in `src/http/server.ts` with optional `requestStore?: RequestStore` defaulting to `new SqliteRequestStore()`; after successful `runChat`, call `requestStore.save({ id: requestId, createdAt: Date.now(), metrics: result.metrics, trace: result.trace })` **before** `res.status(200).json(...)` per `contracts/chat-http.md` and research Decisão 4
- [X] T021 [US2] If `save` throws after a successful turn, do not send a masking 200 — let the error surface as server failure (no silent drop of persistence)
- [X] T022 [US2] Run US2 tests + `npm run typecheck` until green

**Checkpoint**: Turno 200 fica reconstruível no SQLite pelo `requestId`

---

## Phase 5: User Story 3 - Emitir log JSON só com metadados (Priority: P2)

**Goal**: `src/obs/logger.ts` emite uma linha JSON por evento de trace só com metadados (`requestId`, `seq`, `type`, `node?`, `ts`); writer injetável; sem payload/`content`/`args`.

**Independent Test**: Collector writer: K eventos → K linhas parseáveis; nenhuma linha contém `content`, `args`, `steps`, ou `payload`.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T023 [P] [US3] In `src/obs/logger.test.ts`, add failing cases: `logTraceEvent` writes exactly one JSON line per call; parsed object has `requestId`, `seq`, `type`, `ts`; optional `node`; asserting absence of `content` / `args` / `steps` / `payload` per `contracts/logger.md`
- [X] T024 [P] [US3] In `src/obs/logger.test.ts`, add failing case: empty trace path does not invent `logTraceEvent` lines; optional `logRequestLife({ event: "request_end", status: "ok", ... })` emits one metadata-only lifecycle line
- [X] T025 [P] [US3] In `src/http/server.test.ts`, add failing case: inject logger writer collector on `createApp`; after `/chat` 200 with K trace events, collector has K trace lines with matching `requestId` and `seq` 0..K-1

### Implementation for User Story 3

- [X] T026 [US3] Implement `createLogger(writer?: LogWriter)` in `src/obs/logger.ts` with default writer writing `JSON.stringify(meta) + "\n"` to `process.stdout`; expose `logTraceEvent` and `logRequestLife` per `contracts/logger.md` / `data-model.md` LogMetadata (no full TraceEvent serialization)
- [X] T027 [US3] Extend `CreateAppOptions` in `src/http/server.ts` with optional logger; after `runChat` success and before/with save: for each `result.trace` index `seq`, `logTraceEvent({ requestId, seq, type: event.type, node: event.node, ts })`; optionally `logRequestLife` for `request_end`
- [X] T028 [US3] Run US3 tests + `npm run typecheck` until green

**Checkpoint**: Stream de log correlacionável sem payloads

---

## Phase 6: User Story 4 - Consultar request e trace ordenado (Priority: P1)

**Goal**: `GET /request/:id` devolve registro + `trace` ordenado por `seq`; id inexistente → 404 `RequestNotFoundError`; id vazio → 400.

**Independent Test**: Após persistir via `/chat` ou `save`, GET id → 200 com metrics+trace ordenado; id desconhecido → 404 `{ message: "Request não encontrado." }`.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T029 [P] [US4] In `src/http/server.test.ts`, add failing case: after `/chat` 200, `GET /request/${requestId}` → 200 with `requestId`, `createdAt`, `metrics`, and `trace` equal in length/order to the chat response trace per `contracts/get-request-http.md`
- [X] T030 [P] [US4] In `src/http/server.test.ts`, add failing case: `GET /request/00000000-0000-0000-0000-000000000000` → 404 and body `message` is `Request não encontrado.`
- [X] T031 [P] [US4] In `src/http/server.test.ts`, add failing case: `GET /request/` or whitespace-only id handling yields 400 (not 200 with empty list)

### Implementation for User Story 4

- [X] T032 [US4] Add `GET /request/:id` in `src/http/server.ts`: validate `:id` trim non-empty → else 400 with issues/message; `getById` null → throw/map `RequestNotFoundError` → 404 `{ message }`; else 200 `{ requestId, createdAt, metrics, trace }` with trace already ordered by store
- [X] T033 [US4] Register `RequestNotFoundError` mapping next to other domain mappings in `src/http/server.ts` (status 404)
- [X] T034 [US4] Run US4 tests + `npm run typecheck` until green

**Checkpoint**: Ciclo requestId → GET completo

---

## Phase 7: User Story 5 - Conferência automatizada (Priority: P1)

**Goal**: Suíte da feature + projeto verdes sem provedor externo obrigatório; cobrir correlação, persistência, log metadados e GET.

**Independent Test**: `npm run typecheck` e `npm test` verdes; testes da feature usam `:memory:` / fakes / writer collector.

### Tests for User Story 5 ⚠️

- [X] T035 [P] [US5] Audit `src/http/server.test.ts`, `src/store/sqlite-request-store.test.ts`, and `src/obs/logger.test.ts` for coverage gaps vs SC-001..SC-006 in `spec.md` (parallel chats isolation: events of A never appear under GET of B); add any missing failing cases
- [X] T036 [US5] Run full `npm run typecheck` and `npm test` until both green; fix regressions without weakening prior story contracts

**Checkpoint**: FR-009 / SC-006 satisfeitos

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validação quickstart e higiene

- [X] T037 [P] Walk through `specs/015-tracer-persistido/quickstart.md` checklist against implemented behavior; fix doc drift only in that quickstart if commands/paths differ
- [X] T038 Confirm arena/bench are untouched regarding tracer persistence (no required wire) per plan Assumptions; note only if accidental coupling was introduced and remove it
- [X] T039 Final `npm run typecheck` + `npm test` green after polish

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** US2–US5 (US1 could theoretically start after T005 only for error types, but keep after Phase 2 for shared `CreateAppOptions` clarity; US1 implementation does not require store save)
- **US1 (Phase 3)**: After Foundational preferred; only needs server + UUID (store optional unused)
- **US2 (Phase 4)**: Depends on Foundational store + US1 `requestId` in handler
- **US3 (Phase 5)**: Depends on Foundational types; integrates with US1 id + US2 timing (log before/with save). Logger module (T023–T026) can proceed in parallel with US2 once Phase 2 done; HTTP wire (T027) after US1 id exists
- **US4 (Phase 6)**: Depends on Foundational store + US2 persistence for end-to-end; unit GET can use `save` directly
- **US5 (Phase 7)**: Depends on US1–US4
- **Polish (Phase 8)**: After US5

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — MVP correlation only
- **US2 (P1)**: Needs US1 `requestId` + Phase 2 store
- **US3 (P2)**: Logger unit tests independent after Phase 1 stubs; HTTP integration needs US1 (+ ideally US2 order)
- **US4 (P1)**: Needs Phase 2 store; e2e needs US2
- **US5 (P1)**: Cross-cutting verification after US1–US4

### Within Each User Story

- Tests (failing) before implementation
- Store/types before HTTP wire
- Story complete before next priority when sequential

### Parallel Opportunities

- T001–T003 stubs in parallel
- T005–T006 error + types in parallel
- T012–T014 US1 tests in parallel
- T018–T019 US2 tests in parallel
- T023–T025 US3 tests in parallel
- T029–T031 US4 tests in parallel
- After Phase 2: logger implementation (US3) can proceed beside US1 server id work if files don't conflict (`logger.ts` vs `server.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 failing tests together:
Task: "T012 POST /chat requestId === X-Request-Id in src/http/server.test.ts"
Task: "T013 two chats distinct requestIds in src/http/server.test.ts"
Task: "T014 error path keeps X-Request-Id in src/http/server.test.ts"
```

## Parallel Example: User Story 3

```bash
# Logger unit tests (no server):
Task: "T023 logTraceEvent metadata-only in src/obs/logger.test.ts"
Task: "T024 no invented trace lines + optional request_end in src/obs/logger.test.ts"
```

## Parallel Example: User Story 4

```bash
# GET contract tests together:
Task: "T029 GET /request/:id 200 ordered trace in src/http/server.test.ts"
Task: "T030 GET unknown → 404 in src/http/server.test.ts"
Task: "T031 empty id → 400 in src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (store ready for follow-on)
3. Complete Phase 3: US1 (`requestId` + header)
4. **STOP and VALIDATE**: Independent Test US1
5. Demo correlation on `/chat`

### Incremental Delivery

1. Setup + Foundational → store usable
2. US1 → correlation MVP
3. US2 → persistence before 200
4. US3 → JSON metadata logs
5. US4 → GET reconstruction
6. US5 + Polish → typecheck/test + quickstart

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Then:
   - Dev A: US1 → US2 → US4 (HTTP path)
   - Dev B: US3 logger module + tests, then T027 wire
3. US5 integrates both paths

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work
- [Story] label maps to US1–US5 from `spec.md`
- Table names are `requests` + `trace_events` (research Decisão 2), not singular `request`
- Header name is `X-Request-Id` (hyphen)
- Persist only successful `/chat` turns in MVP (incl. blank 200); errors keep header when id assigned
- Commit after each task or logical group
- Avoid coupling strategies/grafo to `RequestStore` or logger (wire only in `src/http/server.ts`)
