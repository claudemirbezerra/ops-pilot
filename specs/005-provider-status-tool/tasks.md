# Tasks: Status de Provedores Externos

**Input**: Design documents from `/specs/005-provider-status-tool/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-011/FR-012 e US3 exigem fetch injetável e cobertura de sucesso, timeout e resposta inválida sem rede; constitution princípio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolds for provider-status helper and deps injection per plan.md / research Decisão 1–2

- [ ] T001 Create `src/agents/provider-status.ts` exporting stubs: `PROVIDER_STATUS_URLS`, `formatProviderStatusLine`, `fetchProviderStatus` (signatures only / TODO bodies) per `plan.md` Structure Decision
- [ ] T002 [P] Create `src/agents/provider-status.test.ts` importing `node:test` / `node:assert/strict` ready for US1–US3 cases (no network)
- [ ] T003 [P] Extend `createOpsTools` signature in `src/agents/tools.ts` with optional second arg `deps?: { fetchImpl?: typeof globalThis.fetch }` (default `{}`) without changing existing call sites' behavior yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: URL map, Zod body schema, compact formatter, and grafo type/prompt wiring that ALL stories need

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Implement `ProviderId` (`"github" | "cloudflare"`) and `PROVIDER_STATUS_URLS` in `src/agents/provider-status.ts` — constraints from `data-model.md`: github → `https://www.githubstatus.com/api/v2/status.json`; cloudflare → `https://www.cloudflarestatus.com/api/v2/status.json`
- [ ] T005 [P] Implement `statusPageBodySchema` in `src/agents/provider-status.ts` with Zod: `status.indicator` string `min(1)`; `status.description` string `min(1)` per `data-model.md` / `contracts/check-provider-status.md`
- [ ] T006 [P] Implement pure `formatProviderStatusLine({ indicator, description })` in `src/agents/provider-status.ts` returning one line `{indicator} — {description}` per research Decisão 4
- [ ] T007 [P] Extend `ToolName` in `src/agents/strategy.ts` with `"check_provider_status"`
- [ ] T008 [P] Add `"check_provider_status"` to `TOOL_NAMES` in `src/agents/trace.ts` so rastro does not fall back to `list_alertas`
- [ ] T009 [P] Update Plan-and-Execute prompt / tool allow-list in `src/agents/plan-and-execute.ts` to mention `check_provider_status` alongside existing tools
- [ ] T010 Run `npm run typecheck` and confirm stubs + ToolName/trace/prompt changes compile under `strict: true`

**Checkpoint**: Foundation ready — happy-path fetch + tool wiring can begin

---

## Phase 3: User Story 1 - Distinguir falha interna de falha do provedor (Priority: P1) 🎯 MVP

**Goal**: Tool `check_provider_status` consulta Statuspage (github default / cloudflare), valida payload, devolve linha compacta; fetch injetável.

**Independent Test**: Com fake fetch, `invoke({})` e `invoke({ provider: "cloudflare" })` devolvem `indicator — description` sem rede.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T011 [P] [US1] Test sucesso default `github` (omit / `{}`): fake fetch returns valid Statuspage JSON → one-line result matching indicator + description in `src/agents/provider-status.test.ts` or `src/agents/tools.test.ts` (SC-001 / SC-004)
- [ ] T012 [P] [US1] Test sucesso `cloudflare`: fake fetch asserts URL is Cloudflare status URL and returns compact line in `src/agents/provider-status.test.ts` or `src/agents/tools.test.ts`

### Implementation for User Story 1

- [ ] T013 [US1] Implement happy-path `fetchProviderStatus(provider, fetchImpl)` in `src/agents/provider-status.ts`: `fetch(url, { signal: AbortSignal.timeout(5_000) })`, parse JSON, Zod `statusPageBodySchema`, return `formatProviderStatusLine` — still may throw internally only if unfinished; prefer returning string already (FR-004–FR-006, FR-008–FR-009)
- [ ] T014 [US1] Implement LangChain tool `check_provider_status` in `src/agents/tools.ts`: schema `provider` enum `github`|`cloudflare` default `github` with `.describe(...)`; description with quando usar / quando não usar (6 regras) per `contracts/check-provider-status.md` / FR-002–FR-003
- [ ] T015 [US1] Wire tool into `createOpsTools` return array (6th tool) using `deps.fetchImpl ?? globalThis.fetch` closed over the helper in `src/agents/tools.ts` (FR-001, FR-011)
- [ ] T016 [US1] Run US1 cases via `npm test` until green (fake fetch only)

**Checkpoint**: MVP — agente pode obter status compacto de GitHub/Cloudflare com fetch injetável

---

## Phase 4: User Story 2 - Falha da consulta vira observação (Priority: P1)

**Goal**: Timeout 5s, exatamente 1 retry em rede/5xx/timeout, sem retry em 4xx/Zod fail; falha final = string legível; nunca throw para fora.

**Independent Test**: Fake fetch força timeout, 5xx→retry, body inválido; `invoke` resolve com string de erro; nenhuma rejeição/exceção escapa.

### Tests for User Story 2 ⚠️

- [ ] T017 [P] [US2] Test timeout / `AbortError`: fake rejects with abort; after retry policy result is readable error string and promise resolves in `src/agents/provider-status.test.ts` (SC-002)
- [ ] T018 [P] [US2] Test HTTP 5xx then success on 2nd attempt → compact success line (SC-005) in `src/agents/provider-status.test.ts`
- [ ] T019 [P] [US2] Test body inválido (`{}` / missing `status`) → readable error string; no throw in `src/agents/provider-status.test.ts` (FR-008, FR-010)
- [ ] T020 [P] [US2] Test HTTP 4xx → error string **without** second fetch call (assert call count === 1) in `src/agents/provider-status.test.ts`

### Implementation for User Story 2

- [ ] T021 [US2] Complete retry/error policy in `fetchProviderStatus` in `src/agents/provider-status.ts`: exactly one retry on network failure, timeout/`AbortError`, or HTTP ≥ 500; no retry on 4xx or Zod/JSON failure; all paths return string; **never** throw (FR-006, FR-007, FR-010; research Decisão 3)
- [ ] T022 [US2] Ensure tool callback in `src/agents/tools.ts` still wraps with `asObservation` defense-in-depth; confirm `invoke` never rejects for provider-status failures
- [ ] T023 [US2] Run US2 cases via `npm test` until green

**Checkpoint**: Falhas de status page são observações; grafo não quebra

---

## Phase 5: User Story 3 - Desenvolvedor valida a tool sem rede (Priority: P2)

**Goal**: Suíte determinística completa (sucesso, timeout, inválido) só com fake fetch; regressão das 5 tools existentes; typecheck verde.

**Independent Test**: `npm test` + `npm run typecheck` verdes; nenhum teste chama status pages reais.

### Tests for User Story 3 ⚠️

- [ ] T024 [P] [US3] Tool-level test: `createOpsTools(store, { fetchImpl })` exposes `check_provider_status` and success/error paths via `invoke` in `src/agents/tools.test.ts` (FR-011, FR-012, SC-003)
- [ ] T025 [P] [US3] Regression: existing tools (`list_alertas`, `open_incident`, `resolver_incident`, `list_incidents`, `consultar_runbook`) still pass on `:memory:` in `src/agents/tools.test.ts`

### Implementation for User Story 3

- [ ] T026 [US3] Audit tests: grep/assert no real `githubstatus.com` / `cloudflarestatus.com` calls; all provider-status cases use injected fetch in `src/agents/provider-status.test.ts` and `src/agents/tools.test.ts`
- [ ] T027 [US3] Fix any `ToolName` / trace / plan-and-execute compile or test fallout from the sixth tool across `src/agents/*.test.ts`
- [ ] T028 [US3] Run full `npm test` and `npm run typecheck` until both green (SC-003)

**Checkpoint**: Feature validável offline; plantão regressão intacta

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Contract alignment and quickstart validation

- [ ] T029 [P] Verify tool description + schema match `specs/005-provider-status-tool/contracts/check-provider-status.md` (6 regras) in `src/agents/tools.ts`
- [ ] T030 Run validation steps in `specs/005-provider-status-tool/quickstart.md` §1 (automated table) and note optional §2 smoke as manual-only
- [ ] T031 Confirm `createOpsTools` / `getDefaultOpsTools` still work for production callers without passing `deps` in `src/agents/tools.ts` and consumers (`src/agents/react.ts`, `src/index.ts` if applicable)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; practically builds on US1 helper/tool (same files)
- **User Story 3 (Phase 5)**: Depends on US1+US2 behavior existing for suite completeness
- **Polish (Phase 6)**: Depends on desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no dependency on US2/US3
- **US2 (P1)**: After Phase 2; shares `provider-status.ts` / `tools.ts` with US1 (sequential on those files)
- **US3 (P2)**: After US1+US2 for meaningful suite; independently validates offline constraint

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Helper before LangChain tool wiring
- Story complete before moving to next priority when sharing files

### Parallel Opportunities

- Phase 1: T002 || T003
- Phase 2: T005 || T006 || T007 || T008 || T009 (after T004 for URL types if shared)
- US1 tests: T011 || T012
- US2 tests: T017 || T018 || T019 || T020
- US3 tests: T024 || T025
- Polish: T029 || (T030 after suite green)

---

## Parallel Example: User Story 1

```bash
# Tests first (fail before impl):
Task: "T011 Test sucesso default github with fake fetch"
Task: "T012 Test sucesso cloudflare with fake fetch"

# Then implementation (same helper/tool files — sequential):
Task: "T013 Implement happy-path fetchProviderStatus"
Task: "T014 Implement check_provider_status tool"
Task: "T015 Wire into createOpsTools array + deps.fetchImpl"
```

---

## Parallel Example: User Story 2

```bash
# All failure-mode tests in parallel:
Task: "T017 Timeout / AbortError → error string"
Task: "T018 5xx then 200 → success line"
Task: "T019 Invalid body → error string"
Task: "T020 4xx → no retry (call count 1)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: fake fetch success github/cloudflare
5. Demo: tool returns compact status line

### Incremental Delivery

1. Setup + Foundational → types/URLs/schema/grafo ready
2. US1 → compact status success (MVP)
3. US2 → resilient errors as observations
4. US3 → full offline suite + regression
5. Polish → contract/quickstart check

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. After Foundational:
   - Dev A: US1 helper happy-path + tool wire
   - Dev B: can draft US2 tests in parallel (same test file — coordinate)
3. Prefer sequential commits on `provider-status.ts` / `tools.ts` to avoid merge conflict

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work
- [Story] label maps task to US1/US2/US3 from spec.md
- Quote constraints preserved: timeout 5s; 1 retry network/5xx/timeout; no retry 4xx/Zod; `indicator`/`description` min(1); format ` — `
- Commit after each task or logical group (constitution VIII)
- Avoid real network in automated tests
)
