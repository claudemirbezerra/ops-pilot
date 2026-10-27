# Tasks: Status de Provedores Externos

**Input**: Design documents from `/specs/005-provider-status-tool/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: IncluÃ­dos â€” FR-011/FR-012 e US3 exigem fetch injetÃ¡vel e cobertura de sucesso, timeout e resposta invÃ¡lida sem rede; constitution princÃ­pio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolds for provider-status helper and deps injection per plan.md / research DecisÃ£o 1â€“2

- [x] T001 Create `src/agents/provider-status.ts` exporting stubs: `PROVIDER_STATUS_URLS`, `formatProviderStatusLine`, `fetchProviderStatus` (signatures only / TODO bodies) per `plan.md` Structure Decision
- [x] T002 [P] Create `src/agents/provider-status.test.ts` importing `node:test` / `node:assert/strict` ready for US1â€“US3 cases (no network)
- [x] T003 [P] Extend `createOpsTools` signature in `src/agents/tools.ts` with optional second arg `deps?: { fetchImpl?: typeof globalThis.fetch }` (default `{}`) without changing existing call sites' behavior yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: URL map, Zod body schema, compact formatter, and grafo type/prompt wiring that ALL stories need

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement `ProviderId` (`"github" | "cloudflare"`) and `PROVIDER_STATUS_URLS` in `src/agents/provider-status.ts` â€” constraints from `data-model.md`: github â†’ `https://www.githubstatus.com/api/v2/status.json`; cloudflare â†’ `https://www.cloudflarestatus.com/api/v2/status.json`
- [x] T005 [P] Implement `statusPageBodySchema` in `src/agents/provider-status.ts` with Zod: `status.indicator` string `min(1)`; `status.description` string `min(1)` per `data-model.md` / `contracts/check-provider-status.md`
- [x] T006 [P] Implement pure `formatProviderStatusLine({ indicator, description })` in `src/agents/provider-status.ts` returning one line `{indicator} â€” {description}` per research DecisÃ£o 4
- [x] T007 [P] Extend `ToolName` in `src/agents/strategy.ts` with `"check_provider_status"`
- [x] T008 [P] Add `"check_provider_status"` to `TOOL_NAMES` in `src/agents/trace.ts` so rastro does not fall back to `list_alertas`
- [x] T009 [P] Update Plan-and-Execute prompt / tool allow-list in `src/agents/plan-and-execute.ts` to mention `check_provider_status` alongside existing tools
- [x] T010 Run `npm run typecheck` and confirm stubs + ToolName/trace/prompt changes compile under `strict: true`

**Checkpoint**: Foundation ready â€” happy-path fetch + tool wiring can begin

---

## Phase 3: User Story 1 - Distinguir falha interna de falha do provedor (Priority: P1) ðŸŽ¯ MVP

**Goal**: Tool `check_provider_status` consulta Statuspage (github default / cloudflare), valida payload, devolve linha compacta; fetch injetÃ¡vel.

**Independent Test**: Com fake fetch, `invoke({})` e `invoke({ provider: "cloudflare" })` devolvem `indicator â€” description` sem rede.

### Tests for User Story 1 âš ï¸

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T011 [P] [US1] Test sucesso default `github` (omit / `{}`): fake fetch returns valid Statuspage JSON â†’ one-line result matching indicator + description in `src/agents/provider-status.test.ts` or `src/agents/tools.test.ts` (SC-001 / SC-004)
- [x] T012 [P] [US1] Test sucesso `cloudflare`: fake fetch asserts URL is Cloudflare status URL and returns compact line in `src/agents/provider-status.test.ts` or `src/agents/tools.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement happy-path `fetchProviderStatus(provider, fetchImpl)` in `src/agents/provider-status.ts`: `fetch(url, { signal: AbortSignal.timeout(5_000) })`, parse JSON, Zod `statusPageBodySchema`, return `formatProviderStatusLine` â€” still may throw internally only if unfinished; prefer returning string already (FR-004â€“FR-006, FR-008â€“FR-009)
- [x] T014 [US1] Implement LangChain tool `check_provider_status` in `src/agents/tools.ts`: schema `provider` enum `github`|`cloudflare` default `github` with `.describe(...)`; description with quando usar / quando nÃ£o usar (6 regras) per `contracts/check-provider-status.md` / FR-002â€“FR-003
- [x] T015 [US1] Wire tool into `createOpsTools` return array (6th tool) using `deps.fetchImpl ?? globalThis.fetch` closed over the helper in `src/agents/tools.ts` (FR-001, FR-011)
- [x] T016 [US1] Run US1 cases via `npm test` until green (fake fetch only)

**Checkpoint**: MVP â€” agente pode obter status compacto de GitHub/Cloudflare com fetch injetÃ¡vel

---

## Phase 4: User Story 2 - Falha da consulta vira observaÃ§Ã£o (Priority: P1)

**Goal**: Timeout 5s, exatamente 1 retry em rede/5xx/timeout, sem retry em 4xx/Zod fail; falha final = string legÃ­vel; nunca throw para fora.

**Independent Test**: Fake fetch forÃ§a timeout, 5xxâ†’retry, body invÃ¡lido; `invoke` resolve com string de erro; nenhuma rejeiÃ§Ã£o/exceÃ§Ã£o escapa.

### Tests for User Story 2 âš ï¸

- [x] T017 [P] [US2] Test timeout / `AbortError`: fake rejects with abort; after retry policy result is readable error string and promise resolves in `src/agents/provider-status.test.ts` (SC-002)
- [x] T018 [P] [US2] Test HTTP 5xx then success on 2nd attempt â†’ compact success line (SC-005) in `src/agents/provider-status.test.ts`
- [x] T019 [P] [US2] Test body invÃ¡lido (`{}` / missing `status`) â†’ readable error string; no throw in `src/agents/provider-status.test.ts` (FR-008, FR-010)
- [x] T020 [P] [US2] Test HTTP 4xx â†’ error string **without** second fetch call (assert call count === 1) in `src/agents/provider-status.test.ts`

### Implementation for User Story 2

- [x] T021 [US2] Complete retry/error policy in `fetchProviderStatus` in `src/agents/provider-status.ts`: exactly one retry on network failure, timeout/`AbortError`, or HTTP â‰¥ 500; no retry on 4xx or Zod/JSON failure; all paths return string; **never** throw (FR-006, FR-007, FR-010; research DecisÃ£o 3)
- [x] T022 [US2] Ensure tool callback in `src/agents/tools.ts` still wraps with `asObservation` defense-in-depth; confirm `invoke` never rejects for provider-status failures
- [x] T023 [US2] Run US2 cases via `npm test` until green

**Checkpoint**: Falhas de status page sÃ£o observaÃ§Ãµes; grafo nÃ£o quebra

---

## Phase 5: User Story 3 - Desenvolvedor valida a tool sem rede (Priority: P2)

**Goal**: SuÃ­te determinÃ­stica completa (sucesso, timeout, invÃ¡lido) sÃ³ com fake fetch; regressÃ£o das 5 tools existentes; typecheck verde.

**Independent Test**: `npm test` + `npm run typecheck` verdes; nenhum teste chama status pages reais.

### Tests for User Story 3 âš ï¸

- [x] T024 [P] [US3] Tool-level test: `createOpsTools(store, { fetchImpl })` exposes `check_provider_status` and success/error paths via `invoke` in `src/agents/tools.test.ts` (FR-011, FR-012, SC-003)
- [x] T025 [P] [US3] Regression: existing tools (`list_alertas`, `open_incident`, `resolver_incident`, `list_incidents`, `consultar_runbook`) still pass on `:memory:` in `src/agents/tools.test.ts`

### Implementation for User Story 3

- [x] T026 [US3] Audit tests: grep/assert no real `githubstatus.com` / `cloudflarestatus.com` calls; all provider-status cases use injected fetch in `src/agents/provider-status.test.ts` and `src/agents/tools.test.ts`
- [x] T027 [US3] Fix any `ToolName` / trace / plan-and-execute compile or test fallout from the sixth tool across `src/agents/*.test.ts`
- [x] T028 [US3] Run full `npm test` and `npm run typecheck` until both green (SC-003)

**Checkpoint**: Feature validÃ¡vel offline; plantÃ£o regressÃ£o intacta

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Contract alignment and quickstart validation

- [x] T029 [P] Verify tool description + schema match `specs/005-provider-status-tool/contracts/check-provider-status.md` (6 regras) in `src/agents/tools.ts`
- [x] T030 Run validation steps in `specs/005-provider-status-tool/quickstart.md` Â§1 (automated table) and note optional Â§2 smoke as manual-only
- [x] T031 Confirm `createOpsTools` / `getDefaultOpsTools` still work for production callers without passing `deps` in `src/agents/tools.ts` and consumers (`src/agents/react.ts`, `src/index.ts` if applicable)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies â€” start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational â€” MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; practically builds on US1 helper/tool (same files)
- **User Story 3 (Phase 5)**: Depends on US1+US2 behavior existing for suite completeness
- **Polish (Phase 6)**: Depends on desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 â€” no dependency on US2/US3
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

# Then implementation (same helper/tool files â€” sequential):
Task: "T013 Implement happy-path fetchProviderStatus"
Task: "T014 Implement check_provider_status tool"
Task: "T015 Wire into createOpsTools array + deps.fetchImpl"
```

---

## Parallel Example: User Story 2

```bash
# All failure-mode tests in parallel:
Task: "T017 Timeout / AbortError â†’ error string"
Task: "T018 5xx then 200 â†’ success line"
Task: "T019 Invalid body â†’ error string"
Task: "T020 4xx â†’ no retry (call count 1)"
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

1. Setup + Foundational â†’ types/URLs/schema/grafo ready
2. US1 â†’ compact status success (MVP)
3. US2 â†’ resilient errors as observations
4. US3 â†’ full offline suite + regression
5. Polish â†’ contract/quickstart check

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. After Foundational:
   - Dev A: US1 helper happy-path + tool wire
   - Dev B: can draft US2 tests in parallel (same test file â€” coordinate)
3. Prefer sequential commits on `provider-status.ts` / `tools.ts` to avoid merge conflict

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work
- [Story] label maps task to US1/US2/US3 from spec.md
- Quote constraints preserved: timeout 5s; 1 retry network/5xx/timeout; no retry 4xx/Zod; `indicator`/`description` min(1); format ` â€” `
- Commit after each task or logical group (constitution VIII)
- Avoid real network in automated tests
)

