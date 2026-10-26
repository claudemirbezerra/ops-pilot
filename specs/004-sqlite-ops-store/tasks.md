# Tasks: Persistência Real de Operações

**Input**: Design documents from `/specs/004-sqlite-ops-store/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-013/FR-014 e US3 exigem testes `:memory:` (seed, abrir/listar/resolver, filtros, CHECKs) e tools sobre SQLite sem rede; constitution princípio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repo hygiene and scaffolds for SQLite store per plan.md

- [x] T001 Add `data/` to `.gitignore` (FR-012)
- [x] T002 [P] Remove `mysql`, `mysql2`, and `sequelize` (and `@types/sequelize`) from `package.json` and refresh lockfile (`npm install`) per constitution v2.0.0 / research Decisão 9
- [x] T003 [P] Scaffold `src/store/` directory with placeholder `src/store/sqlite-ops-store.ts` exporting `class SqliteOpsStore` accepting `path?: string` per `contracts/ops-store.md`
- [x] T004 [P] Create empty `src/store/sqlite-ops-store.test.ts` and `src/agents/tools.test.ts` importing `node:test` / `node:assert/strict` ready for US1–US3 cases

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain contract `OpsStore`, Mercadinho seed payload (slugs atuais + tier + runbooks), and in-memory parity that ALL stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create/extend domain types in `src/domain/types.ts`: `ServiceTier` (`critical` \| `high` \| `standard`); `tier` on `ServiceRecord` (required); `createdAt` / `resolvedAt` / `summary` on `IncidentRecord` (`resolvedAt` and `summary` nullable); `RunbookRecord` (`service` PK, `content` required); full `OpsStore` interface (`seed`, `listAlerts`, `listIncidents`, `openIncident`, `resolveIncident(id, summary?)`, `getRunbook`) per `data-model.md` / `contracts/ops-store.md`
- [x] T006 [P] Add `RunbookNotFoundError` to `src/domain/errors.ts` per `data-model.md`
- [x] T007 Extend Mercadinho seed payload (prefer `src/seed/primary-catalog.json` + loader, or `src/store/seed-mercadinho.ts` + JSON): keep 5 slugs `checkout`/`payments`/`auth`/`api-gateway`/`notifications` with tiers (`critical`/`critical`/`high`/`high`/`standard`); keep 6 alerts (3 firing / 3 resolved); add 3 runbooks (`checkout`, `payments`, `auth`) per research Decisão 3 — quote constraints: `tier` CHECK ∈ critical|high|standard; alert `severity` ∈ critical|high|medium|low; alert `status` ∈ firing|resolved
- [x] T008 Implement `src/store/seed-mercadinho.ts`: Zod schemas for tier + runbooks; `loadMercadinhoSeed()` + `seedOpsStore(store: OpsStore)` calling `store.seed(...)` (idempotent caller side) per research Decisão 2/5
- [x] T009 Implement `src/store/in-memory-ops-store.ts` as `InMemoryOpsStore implements OpsStore` (runbooks map; `listIncidents` filter open|resolved|all; `getRunbook` throws `RunbookNotFoundError`; `resolveIncident(id, summary?)` sets `resolvedAt`/`summary`; idempotent `seed`) per `contracts/ops-store.md`
- [x] T010 Update `src/agents/store.ts` to re-export `OpsStore` types / helpers needed by agents; stop using `json-db` as the default production path (leave delete/cleanup to polish if still referenced)
- [x] T011 [P] Add `src/store/in-memory-ops-store.test.ts` smoke: seed ×2 no dup; listAlerts firing=3; getRunbook(`payments`) hit; getRunbook(`notifications`) miss
- [x] T012 Update `src/bench.ts` and `src/arena.ts` to construct `InMemoryOpsStore` + `seedOpsStore` (MUST NOT use SQLite file) per research Decisão 7
- [x] T013 Run `npm run typecheck` and confirm domain + in-memory + seed compile under `strict: true`

**Checkpoint**: Foundation ready — SQLite persistence and new tools can begin

---

## Phase 3: User Story 1 - Plantonista mantém estado entre reinícios (Priority: P1) 🎯 MVP

**Goal**: `SqliteOpsStore` persiste services/alerts/incidents/runbooks em arquivo (`OPSPILOT_DB`); seed Mercadinho idempotente; composição de produção injeta SQLite.

**Independent Test**: `SqliteOpsStore(":memory:")` + seed → 5 serviços / 6 alertas / 3 runbooks; open+resolve sobrevivem ao reabrir o mesmo path de arquivo (smoke); bootstrap HTTP/estratégias default usam `SqliteOpsStore`.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Test seed idempotente ×2: 5 services, 6 alerts (3 firing / 3 resolved), 3 runbooks; sem duplicar PKs in `src/store/sqlite-ops-store.test.ts` (SC-002)
- [x] T015 [P] [US1] Test `openIncident` → `listIncidents("open")` → `resolveIncident` → `listIncidents("resolved")` with `resolvedAt` / `summary` in `src/store/sqlite-ops-store.test.ts` (SC-003) — constraints: incident `status` ∈ open|resolved; `resolved_at`/`summary` nullable until resolve
- [x] T016 [P] [US1] Test `listAlerts` filters (`firing` / `resolved` / `all`) against seeded Mercadinho in `src/store/sqlite-ops-store.test.ts`

### Implementation for User Story 1

- [x] T017 [US1] Implement `SqliteOpsStore` in `src/store/sqlite-ops-store.ts`: open `DatabaseSync`, `mkdirSync` for file parents when path ≠ `:memory:`, idempotent DDL for tables `services`, `alerts`, `incidents`, `runbooks` with CHECKs (`tier` ∈ critical|high|standard; `severity` ∈ critical|high|medium|low; alert `status` ∈ firing|resolved; incident `status` ∈ open|resolved) per `data-model.md`
- [x] T018 [US1] Implement prepared statements + methods `seed`, `listAlerts`, `listIncidents`, `openIncident`, `resolveIncident`, `getRunbook` in `src/store/sqlite-ops-store.ts` (no SQL concatenation; `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` on PKs; numeric incident ids) per `contracts/ops-store.md` / FR-007
- [x] T019 [US1] Expose internal `database` (or equivalent `/** @internal */`) on `SqliteOpsStore` for CHECK tests later per research Decisão 10
- [x] T020 [US1] Wire production composition: default store for `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and HTTP bootstrap (`src/index.ts` / chat service) to `SqliteOpsStore(process.env.OPSPILOT_DB ?? "./data/opspilot.db")` + `seedOpsStore(store)` + `createOpsTools(store)` (FR-011)
- [x] T021 [US1] Update `src/seed.ts` to seed SQLite via `OPSPILOT_DB` (replace `json-db` seed path)
- [x] T022 [US1] Run US1 cases in `src/store/sqlite-ops-store.test.ts` via `npm test` until green

**Checkpoint**: MVP — estado operacional persiste via SQLite; seed Mercadinho disponível

---

## Phase 4: User Story 2 - Agente lista incidentes e consulta runbooks (Priority: P2)

**Goal**: Tools `list_incidents` e `consultar_runbook`; todas as 5 tools em `src/agents/tools.ts` alinhadas às 6 regras (dívida `open_incident`).

**Independent Test**: Invocar tools contra `SqliteOpsStore(":memory:")` seedado — filtros de incidentes e runbook hit/miss sem rede.

### Tests for User Story 2 ⚠️

- [x] T023 [P] [US2] Tool test `list_incidents` default `open` + filtros `resolved` / `all` in `src/agents/tools.test.ts` (SC-005)
- [x] T024 [P] [US2] Tool test `consultar_runbook` hit (`payments`) and miss (serviço sem runbook → observação descritiva) in `src/agents/tools.test.ts`
- [x] T025 [P] [US2] Tool regression: `list_alertas` / `open_incident` / `resolver_incident` still work on `:memory:` SQLite in `src/agents/tools.test.ts` (FR-014)

### Implementation for User Story 2

- [x] T026 [US2] Revise `list_alertas`, `open_incident`, `resolver_incident` in `src/agents/tools.ts`: descriptions with quando usar / quando não usar; `.describe()` on every field; enums; optional `summary` on `resolver_incident`; accept `OpsStore` instead of `StoreHolder` per `contracts/tools.md` / FR-010
- [x] T027 [P] [US2] Implement `list_incidents` tool in `src/agents/tools.ts` (`status` open|resolved|all, default open) per `contracts/tools.md` / FR-008
- [x] T028 [P] [US2] Implement `consultar_runbook` tool in `src/agents/tools.ts` (catch `RunbookNotFoundError` → observação string) per FR-009
- [x] T029 [US2] Update `createOpsTools(store: OpsStore)` in `src/agents/tools.ts` to return all 5 tools in order: `list_alertas`, `open_incident`, `resolver_incident`, `list_incidents`, `consultar_runbook`
- [x] T030 [US2] Run US2 cases in `src/agents/tools.test.ts` via `npm test` until green

**Checkpoint**: Agente tem listagem de incidentes + runbooks; descrições passam nas 6 regras

---

## Phase 5: User Story 3 - Desenvolvedor valida persistência e tools sem rede (Priority: P3)

**Goal**: CHECKs cobertos; suíte completa verde; bench/arena permanecem `InMemoryOpsStore` para cenários reproduzíveis; limpeza do legado MySQL/JSON.

**Independent Test**: `npm test` + `npm run typecheck` verdes; INSERT inválido rejeitado; bench não depende de `./data/opspilot.db`.

### Tests for User Story 3 ⚠️

- [x] T031 [P] [US3] CHECK rejection tests (invalid `tier` / `severity` / `status`) via internal `database` prepare/run in `src/store/sqlite-ops-store.test.ts` (SC-004 / FR-013)
- [x] T032 [P] [US3] Assert `src/bench.ts` still constructs `InMemoryOpsStore` + `seedOpsStore` (grep/smoke in test or comment contract); do not switch bench to SQLite file (SC-006)

### Implementation for User Story 3

- [x] T033 [US3] Confirm `src/arena.ts` remains on `InMemoryOpsStore` + seed API per research Decisão 7; fix compile breaks from `OpsStore` migration
- [x] T034 [US3] Remove or stop referencing dead MySQL/JSON paths: `src/seed/json-db.ts`, `src/models/*`, `src/db/*`, `src/services/catalog-seed-service.ts` — update any remaining imports/tests
- [x] T035 [US3] Migrate remaining `src/agents/store.test.ts` (and other store consumers) to `InMemoryOpsStore` or `SqliteOpsStore(":memory:")` so suite has no `json-db` dependency
- [x] T036 [US3] Run full `npm test` and `npm run typecheck` until green (SC-006)

**Checkpoint**: Harness de desenvolvimento completo e reproduzível sem rede

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation against quickstart and final hygiene

- [x] T037 [P] Walk `specs/004-sqlite-ops-store/quickstart.md` automated checklist items and fix gaps
- [x] T038 [P] Document/verify file-persistence smoke for SC-001 in `specs/004-sqlite-ops-store/quickstart.md` (same `OPSPILOT_DB` across restart)
- [x] T039 Final review: no SQL string concatenation in `src/store/sqlite-ops-store.ts`; `data/` ignored; five tools registered with 6-rule descriptions; no Sequelize/MySQL in `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP persistence
- **User Story 2 (Phase 4)**: Depends on Foundational; practically after US1 so tools tests use real `SqliteOpsStore`
- **User Story 3 (Phase 5)**: Depends on US1 + US2 (CHECK + full suite + legacy cleanup)
- **Polish (Phase 6)**: Depends on stories intended for release

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2/US3
- **US2 (P2)**: Needs `SqliteOpsStore` + seed from US1 for `:memory:` tool tests; independently valuable once store exists
- **US3 (P3)**: Hardens US1/US2 with CHECK coverage, entrypoint guarantees, and legacy removal

### Within Each User Story

- Tests FIRST (fail) → implementation → `npm test` green
- Domain/seed before SQLite methods
- Store before tools
- Tools before cross-entrypoint polish / legacy delete

### Parallel Opportunities

- T002, T003, T004 in Setup
- T006 parallel with T005; T007/T008 after types exist; T011 after T009
- T014–T016 US1 tests in parallel
- T023–T025 US2 tests in parallel
- T027–T028 tool implementations in parallel only if split files; same-file → sequential for single agent
- T031–T032 US3 tests in parallel
- T037–T038 polish in parallel

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together (expect FAIL before T017–T019):
Task: "Test seed idempotente ×2 in src/store/sqlite-ops-store.test.ts"
Task: "Test open → list → resolve cycle in src/store/sqlite-ops-store.test.ts"
Task: "Test listAlerts filters in src/store/sqlite-ops-store.test.ts"
```

## Parallel Example: User Story 2

```bash
# Launch US2 tool tests together:
Task: "list_incidents filters in src/agents/tools.test.ts"
Task: "consultar_runbook hit/miss in src/agents/tools.test.ts"
Task: "existing tools on :memory: SQLite in src/agents/tools.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `:memory:` seed + CRUD green; bootstrap uses SQLite
5. Demo/restart smoke with `OPSPILOT_DB` if desired

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → persistência real (MVP)
3. US2 → tools de incidentes/runbooks + 6 regras
4. US3 → CHECKs + limpeza legado + suite verde
5. Polish → quickstart / SC-001

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational:
   - Dev A: US1 (`SqliteOpsStore` + wire)
   - Dev B: pode preparar contratos/testes de tools (US2) contra interface mock/`InMemoryOpsStore`
3. Após US1: completar US2 sobre `:memory:` SQLite
4. US3 + Polish em sequência

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Preserve Mercadinho slugs (`api-gateway`, `checkout`, `payments`, `auth`, `notifications`) — do not rename to catalog/inventory
- Keep tool names `list_alertas` / `resolver_incident`; add `list_incidents` / `consultar_runbook`
- Incident ids remain numeric
- Commit after each task or logical group (princípio VIII)
- Stop at any checkpoint to validate story independently
