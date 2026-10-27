# Tasks: Servidor MCP OpsPilot

**Input**: Design documents from `/specs/006-mcp-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: IncluÃ­dos â€” FR-008 e US4 exigem teste do servidor que valida `tools/list` (`list_alerts`, `open_incident`, `resolve_incident`); constitution princÃ­pio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: DependÃªncia MCP, script npm e esqueleto `src/mcp/` per plan.md / research DecisÃ£o 1 e 5

- [x] T001 Add dependency `@modelcontextprotocol/sdk` to `package.json` and install (`npm install`)
- [x] T002 [P] Add npm script `"mcp"` in `package.json` as `tsx src/mcp/server.ts` (or `node --env-file=.env --import tsx src/mcp/server.ts` if env load needed for `OPSPILOT_DB`, mirroring `dev`; app code must not read `.env`)
- [x] T003 [P] Create `src/mcp/server.ts` stub exporting `createOpsMcpServer(store)` placeholder and a `main` guard (no `console.log`; no `connect` yet)
- [x] T004 [P] Create `src/mcp/server.test.ts` scaffold with `node:test` / `node:assert/strict` ready for tools/list cases (in-memory store; no network)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fonte Ãºnica de schemas Zod â€” bloqueia US1â€“US4 (FR-005)

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `src/agents/ops-tool-schemas.ts` exporting shared Zod inputs with constraints from `data-model.md` / `contracts/mcp-tools.md`:
  - `listAlertsInputSchema`: `status` enum `"firing" | "resolved" | "all"` default `"firing"` + `.describe(...)`
  - `openIncidentInputSchema`: `title` string `min(1)`; `service` string `min(1)`; `severity` enum `"low" | "medium" | "high" | "critical"` + describes
  - `resolveIncidentInputSchema`: `id` number int positive; `summary` string `min(1)` optional + describes
  - Also export reusable tool description strings for the three ops tools if helpful
- [x] T006 Refactor `src/agents/tools.ts` so `list_alertas`, `open_incident`, and `resolver_incident` import schemas (and descriptions) from `src/agents/ops-tool-schemas.ts` â€” no duplicated Zod objects
- [x] T007 Run existing agent tool tests via `npm test` (filter or full) and `npm run typecheck` to confirm schema extract did not break `list_alertas` / `open_incident` / `resolver_incident`

**Checkpoint**: Foundation ready â€” MCP can import the same schemas as the agent

---

## Phase 3: User Story 1 - Cliente MCP descobre e lista as ferramentas (Priority: P1) ðŸŽ¯ MVP

**Goal**: Servidor `opspilot` anuncia exatamente `list_alerts`, `open_incident`, `resolve_incident` com schemas compartilhados via `tools/list`.

**Independent Test**: `createOpsMcpServer(store)` + client in-memory â†’ `listTools()` contÃ©m os trÃªs nomes; identidade `opspilot`.

### Tests for User Story 1 âš ï¸

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [P] [US1] Test `tools/list` includes `list_alerts`, `open_incident`, `resolve_incident` using `createOpsMcpServer` + MCP Client / in-memory linked transport in `src/mcp/server.test.ts` (FR-008, SC-001, SC-003)
- [x] T009 [P] [US1] Test server identity name is `opspilot` on handshake / initialize metadata in `src/mcp/server.test.ts` (FR-001)

### Implementation for User Story 1

- [x] T010 [US1] Implement `createOpsMcpServer(store: OpsStore): McpServer` in `src/mcp/server.ts` with `McpServer({ name: "opspilot", version })` from `@modelcontextprotocol/sdk/server/mcp.js` (research DecisÃ£o 1 e 4)
- [x] T011 [US1] Register the three tools in `createOpsMcpServer` with MCP names `list_alerts` / `open_incident` / `resolve_incident`, descriptions, and `inputSchema` imported from `src/agents/ops-tool-schemas.ts` (handlers may be stubs returning empty/placeholder text for MVP discovery) â€” FR-003, FR-005
- [x] T012 [US1] Run US1 cases in `src/mcp/server.test.ts` via `npm test` until green (no network)

**Checkpoint**: MVP â€” host MCP pode descobrir as trÃªs tools e o nome `opspilot`

---

## Phase 4: User Story 2 - Operador lista alertas, abre e resolve via MCP (Priority: P1)

**Goal**: Handlers das trÃªs tools leem/escrevem o mesmo `OpsStore`; args invÃ¡lidos rejeitados na fronteira Zod; erros de domÃ­nio como observaÃ§Ã£o.

**Independent Test**: Com store seedado in-memory, `callTool` de `list_alerts` / `open_incident` / `resolve_incident` reflete estado no store; args invÃ¡lidos nÃ£o mutam o store.

### Tests for User Story 2 âš ï¸

- [x] T013 [P] [US2] Test `list_alerts` returns JSON consistent with seeded alerts via MCP `callTool` in `src/mcp/server.test.ts` (SC-002)
- [x] T014 [P] [US2] Test `open_incident` with valid args creates open incident in the same store in `src/mcp/server.test.ts`
- [x] T015 [P] [US2] Test `resolve_incident` with valid id resolves incident in the same store in `src/mcp/server.test.ts`
- [x] T016 [P] [US2] Test invalid args (e.g. empty title / bad severity) are rejected without corrupting store in `src/mcp/server.test.ts` (FR-009)

### Implementation for User Story 2

- [x] T017 [US2] Implement `list_alerts` handler in `src/mcp/server.ts`: `store.listAlerts(status)` â†’ MCP text content with JSON; domain errors â†’ readable text (optional `isError: true`); never break transport â€” per `contracts/mcp-tools.md` / FR-004, FR-010
- [x] T018 [US2] Implement `open_incident` handler in `src/mcp/server.ts`: `store.openIncident({ title, service, severity })` â†’ JSON `IncidentRecord`; same observation error policy
- [x] T019 [US2] Implement `resolve_incident` handler in `src/mcp/server.ts`: `store.resolveIncident(id, summary?)` â†’ JSON resolved record; align missing-id behavior with agent tools
- [x] T020 [US2] Reuse shared observation helper pattern (extract small `asObservation` to shared module or duplicate minimally next to MCP handlers) so domain failures match agent tools in `src/mcp/server.ts` / optionally `src/agents/tools.ts`
- [x] T021 [US2] Run US2 cases via `npm test` until green

**Checkpoint**: Ciclo list â†’ open â†’ resolve funciona via MCP no mesmo OpsStore

---

## Phase 5: User Story 3 - Subir o servidor sem poluir o canal do protocolo (Priority: P1)

**Goal**: `npm run mcp` sobe stdio; diagnÃ³stico sÃ³ em stderr; zero `console.log` no server.

**Independent Test**: Script `mcp` presente; entrypoint conecta `StdioServerTransport`; grep sem `console.log` em `src/mcp/`; falhas de bootstrap usam stderr.

### Tests for User Story 3 âš ï¸

- [x] T022 [P] [US3] Test or static assert: no `console.log` in `src/mcp/` (e.g. read source in test or dedicated assert) in `src/mcp/server.test.ts` (FR-007, SC-004)
- [x] T023 [P] [US3] Assert `package.json` scripts contain `mcp` pointing at the MCP entrypoint in `src/mcp/server.test.ts` or a small package-script check

### Implementation for User Story 3

- [x] T024 [US3] Implement `main` in `src/mcp/server.ts`: `createDefaultOpsStore()` â†’ `createOpsMcpServer(store)` â†’ `await server.connect(new StdioServerTransport())` from `@modelcontextprotocol/sdk/server/stdio.js`; only run when file is main entry
- [x] T025 [US3] Ensure bootstrap/fatal errors use `console.error` or `process.stderr.write` only â€” never `console.log` â€” in `src/mcp/server.ts` (FR-007)
- [x] T026 [US3] Confirm `package.json` script `mcp` matches contract (`tsx src/mcp/server.ts` or env-file variant per T002) and document choice in comment only if needed (no app `.env` read)
- [x] T027 [US3] Manual smoke per `quickstart.md` Â§2: `npm run mcp` waits on stdio without stdout banners (operator check; note in PR/commit if done)

**Checkpoint**: Processo MCP integrÃ¡vel por host sem corromper stdout

---

## Phase 6: User Story 4 - Teste garante o contrato de listagem (Priority: P2)

**Goal**: SuÃ­te automatizada estÃ¡vel e determinÃ­stica cobrindo listagem das trÃªs tools; sem rede.

**Independent Test**: `npm test` roda `src/mcp/server.test.ts` e passa 100% nos asserts de listagem.

### Tests for User Story 4 âš ï¸

- [x] T028 [P] [US4] Harden `tools/list` assertions: exactly the three required names present (and no accidental requirement to list extra tools beyond scope) in `src/mcp/server.test.ts` (FR-003, FR-008, SC-003)
- [x] T029 [P] [US4] Confirm test uses `createInMemorySeededStore()` or SQLite `:memory:` only â€” no network â€” in `src/mcp/server.test.ts`

### Implementation for User Story 4

- [x] T030 [US4] Fix any flaky transport/setup in `src/mcp/server.test.ts` so listTools is deterministic on Windows/CI
- [x] T031 [US4] Run full `npm test` and `npm run typecheck` until both green

**Checkpoint**: Contrato de descoberta protegido por teste de regressÃ£o

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: ValidaÃ§Ã£o quickstart e higiene final

- [x] T032 [P] Grep `src/mcp/` for `console.log` / stdout diagnostics and remove any leftovers
- [x] T033 [P] Verify schemas in `src/agents/ops-tool-schemas.ts` remain the single import source for both `src/agents/tools.ts` and `src/mcp/server.ts` (no divergent copies)
- [x] T034 Run validation from `specs/006-mcp-server/quickstart.md` (Â§1 automated + Â§2 smoke) and fix gaps
- [x] T035 Final `npm test` + `npm run typecheck` green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies â€” start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories (shared Zod schemas)
- **US1 (Phase 3)**: After Foundational â€” MVP discovery
- **US2 (Phase 4)**: After US1 registration exists (handlers replace stubs)
- **US3 (Phase 5)**: After US1 factory exists; can overlap late US2 for `main`/script
- **US4 (Phase 6)**: After US1 test exists; hardens list contract
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 â€” no dependency on US2â€“US4
- **US2 (P1)**: Needs US1 tool registration surface; independently testable via `callTool`
- **US3 (P1)**: Needs factory from US1; script/stdio independent of full US2 handlers (stubs ok for smoke, full handlers preferred)
- **US4 (P2)**: Extends US1 tests; can start once T008 exists

### Parallel Opportunities

- T002, T003, T004 after T001 (or T003/T004 parallel once package ready)
- T008 || T009 (US1 tests)
- T013â€“T016 (US2 tests) in parallel
- T017â€“T019 (handlers) sequential preferred (same file `server.ts`) â€” do not mark [P]
- T022 || T023 (US3 tests)
- T028 || T029 (US4 tests)
- T032 || T033 (polish)

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "T008 tools/list three names in src/mcp/server.test.ts"
Task: "T009 identity opspilot in src/mcp/server.test.ts"

# Then implementation (same file â€” sequential):
Task: "T010 createOpsMcpServer in src/mcp/server.ts"
Task: "T011 register three tools with shared schemas in src/mcp/server.ts"
Task: "T012 npm test US1 green"
```

---

## Parallel Example: User Story 2

```bash
# Tests in parallel:
Task: "T013 list_alerts callTool in src/mcp/server.test.ts"
Task: "T014 open_incident callTool in src/mcp/server.test.ts"
Task: "T015 resolve_incident callTool in src/mcp/server.test.ts"
Task: "T016 invalid args in src/mcp/server.test.ts"

# Handlers sequential in src/mcp/server.ts:
Task: "T017 list_alerts handler"
Task: "T018 open_incident handler"
Task: "T019 resolve_incident handler"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (SDK + stubs + script)
2. Phase 2: Extract shared Zod schemas + agent refactor
3. Phase 3: US1 discovery (`opspilot` + tools/list)
4. **STOP and VALIDATE**: `src/mcp/server.test.ts` listTools green
5. Demo discovery to MCP host if desired

### Incremental Delivery

1. Setup + Foundational â†’ schemas Ãºnicos
2. US1 â†’ discovery MVP
3. US2 â†’ ciclo operacional via MCP
4. US3 â†’ `npm run mcp` + stdout limpo
5. US4 â†’ endurece teste de listagem
6. Polish â†’ quickstart verde

### Parallel Team Strategy

1. Together: Phase 1â€“2
2. Then: Dev A US1+US4 tests; Dev B US2 handlers after registration stubs; Dev C US3 script/stdio hygiene

---

## Notes

- [P] = different files, no incomplete-task dependencies
- MCP tool names are English (`list_alerts`, `resolve_incident`); agent keeps `list_alertas` / `resolver_incident`
- Never `console.log` in `src/mcp/**`
- Commit after each task or logical group
- Suggested MVP: Phases 1â€“3 (US1)

