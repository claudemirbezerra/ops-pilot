# Tasks: NÃºcleo de raciocÃ­nio

**Input**: Design documents from `/specs/001-nucleo-raciocinio/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: IncluÃ­dos. A spec e o FR-020 pedem conferÃªncia determinÃ­stica do store e da formataÃ§Ã£o do rastro, sem rede. A constituiÃ§Ã£o exige teste em lÃ³gica nova.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` at repository root; tests as `src/**/*.test.ts` (matches `npm test`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar o esqueleto do projeto e o mÃ³dulo de agentes previstos no plan.md. CatÃ¡logo, Sequelize e `npm run seed` jÃ¡ existem.

- [X] T001 Create empty agent module placeholders `src/agents/strategy.ts`, `src/agents/store.ts`, `src/agents/trace.ts`, `src/agents/tools.ts`, `src/agents/model.ts`, `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and ensure `src/arena.ts` exists as a stub entry
- [X] T002 Confirm `mysql2` is listed in `package.json` dependencies and that `npm run seed` remains wired to `tsx src/seed.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contrato compartilhado, erros de domÃ­nio, store em memÃ³ria e fÃ¡brica de modelo. Bloqueia todas as user stories.

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Extend domain error classes in `src/domain/errors.ts` for invalid alert status, unknown service, unknown incident id, missing model config, unknown strategy, and empty strategy selection
- [X] T004 [P] Define `ReasoningStrategy`, `StrategyResult`, `TraceEvent` (`thought` | `action` | `observation` | `plan` | `critique` | `answer`), and `Metrics` (`llmCalls`, `latencyMs`) in `src/agents/strategy.ts` per `contracts/reasoning-strategy.md`
- [X] T005 [P] Define pure in-memory `Store` types (services with `slug`/`name`/`description`, alerts with `serviceSlug`/`title`/`detail`/`status` `firing|resolved`/`severity` `low|medium|high|critical`, incidents with `id`/`title`/`serviceSlug`/`severity`/`status` `open|resolved`, `nextIncidentId` starting at 1) and `createStoreFromPrimaryCatalog()` in `src/agents/store.ts` using `src/seed/primary-catalog.ts`
- [X] T006 [P] Implement pure `formatTrace(events)` and message-to-event helpers in `src/agents/trace.ts` so `action` always carries `tool` and `args`
- [X] T007 Implement OpenRouter model factory in `src/agents/model.ts`: read `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from `process.env` only (never open `.env`), `ChatOpenAI` with `temperature: 0` and `configuration.baseURL = "https://openrouter.ai/api/v1"`, throw domain error when key or model is missing

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Carregar o retrato do plantÃ£o (Priority: P1) ðŸŽ¯ MVP

**Goal**: O plantonista carrega o catÃ¡logo primÃ¡rio (5 serviÃ§os, 6 alertas: 3 `firing`, 3 `resolved`) e lista alertas por situaÃ§Ã£o.

**Independent Test**: `npm run seed` (com MySQL) imprime as contagens; `list_alertas` sobre o store em memÃ³ria devolve 3 `firing` e 3 `resolved` sem estratÃ©gia.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T008 [P] [US1] Add failing store tests in `src/agents/store.test.ts` for `createStoreFromPrimaryCatalog` (5 services, 6 alerts, 3 firing, 3 resolved, `checkout` with >1 alert) and for `listAlerts` filtering by `firing`/`resolved` plus rejection of invalid status (store unchanged)
- [X] T009 [P] [US1] Confirm existing catalog tests in `src/seed/primary-catalog.test.ts` still assert FR-012/FR-013 service slugs and alert titles; extend only if a gap remains

### Implementation for User Story 1

- [X] T010 [US1] Implement pure `listAlerts(store, status)` in `src/agents/store.ts` accepting only `firing` or `resolved` and throwing the domain error from T003 otherwise
- [X] T011 [US1] Implement Zod-validated `list_alertas` tool in `src/agents/tools.ts` that calls `listAlerts`, returns the filtered list on success, and on domain error returns the message as observation text without mutating the store
- [X] T012 [US1] Verify `src/seed.ts`, `src/services/catalog-seed-service.ts`, and `contracts/seed-cli.md` behavior: replace services/alerts, exit 0 with `CatÃ¡logo carregado: 5 serviÃ§os, 6 alertas (3 em disparo, 3 resolvidos).`, idempotent second run; fix gaps only if the existing seed diverges

**Checkpoint**: User Story 1 is independently testable (seed + list alerts) without ReAct or arena

---

## Phase 4: User Story 2 - Abrir e resolver um incidente (Priority: P1)

**Goal**: Abrir incidente em serviÃ§o conhecido e resolvÃª-lo pelo id, sem estratÃ©gia.

**Independent Test**: No store em memÃ³ria, abrir incidente em `checkout` e resolver; serviÃ§o/`id` desconhecido recusam sem alterar o store.

### Tests for User Story 2

- [X] T013 [P] [US2] Extend `src/agents/store.test.ts` with failing cases: `openIncident` on `checkout` yields `open` + id â‰¥ 1; `resolveIncident` sets `resolved`; second resolve stays `resolved` without duplicating; unknown service and unknown id throw and leave store equal

### Implementation for User Story 2

- [X] T014 [US2] Implement pure `openIncident(store, { title, service, severity })` in `src/agents/store.ts` (`severity` âˆˆ `low|medium|high|critical`, service must exist, new id from `nextIncidentId`, status `open`)
- [X] T015 [US2] Implement pure `resolveIncident(store, id)` in `src/agents/store.ts` (`id` positive integer; missing id throws; already `resolved` confirms without a second record)
- [X] T016 [US2] Add Zod-validated `open_incident` and `resolver_incident` tools in `src/agents/tools.ts` that apply T014/T015, capture domain errors as observation text, and never mutate the store on refusal
- [X] T017 [US2] Export a single `createOpsTools(storeRef)` factory from `src/agents/tools.ts` returning the three tools sharing one mutable store holder for the LangChain tool API

**Checkpoint**: User Stories 1 and 2 work via store + tools without any LLM strategy

---

## Phase 5: User Story 3 - Receber resposta, rastro e custo (Priority: P2)

**Goal**: Toda execuÃ§Ã£o devolve `answer`, `trace` e `metrics` (`llmCalls`, `latencyMs`); aÃ§Ã£o no rastro mostra `tool` e `args`; pedido vazio e teto atingido tÃªm respostas definidas.

**Independent Test**: Formatar um rastro fixo e um resultado de pedido vazio; conferir mÃ©tricas e o texto de teto sem rede.

### Tests for User Story 3

- [X] T018 [P] [US3] Add failing tests in `src/agents/trace.test.ts`: formatting the same fixed event list twice yields identical text; each `action` line includes `tool` and `args`; last event `answer.content` matches `StrategyResult.answer` helper if present
- [X] T019 [P] [US3] Add failing tests in `src/agents/strategy.test.ts` (or adjacent helper test) for empty-input result shape: single `answer` event asking for an operational request, `llmCalls === 0`, store untouched

### Implementation for User Story 3

- [X] T020 [US3] Complete `formatTrace` and any `buildEmptyInputResult` / `buildLimitReachedResult` helpers in `src/agents/trace.ts` and `src/agents/strategy.ts` so empty input never calls the model and limit-reached answer declares the iteration ceiling
- [X] T021 [US3] Add a shared `runWithMetrics(name, work)` helper in `src/agents/strategy.ts` that measures `latencyMs`, returns `StrategyResult`, and keeps `llmCalls` supplied by the caller/wrapper
- [X] T022 [US3] Add an LLM-call counting wrapper used by strategies in `src/agents/model.ts` (or a thin `src/agents/llm-limit.ts`) that increments only real network calls and, when `maxIterations` is reached, returns a final no-tool-call message with the limit text without counting that synthetic response

**Checkpoint**: Contract of answer + trace + metrics is enforceable offline; model factory + limiter ready for US4/US5

---

## Phase 6: User Story 4 - Raciocinar passo a passo com ferramentas (Priority: P2)

**Goal**: EstratÃ©gia ReAct com `createReactAgent`, tools do plantÃ£o, rastro completo, respeito a `maxIterations`.

**Independent Test**: Rodar sÃ³ ReAct pedindo alertas em disparo; rastro tem thought/action/observation/answer; com teto 2 para antes de concluir espontaneamente.

### Implementation for User Story 4

- [X] T023 [US4] Implement `reactStrategy` in `src/agents/react.ts` using `createReactAgent` from `@langchain/langgraph/prebuilt`, tools from `createOpsTools`, model from T007/T022, graph version `"v1"`
- [X] T024 [US4] Map final agent messages to `TraceEvent[]` via `src/agents/trace.ts` (AI text + tool_calls â†’ `thought`/`action`; `ToolMessage` â†’ `observation`; final AI without tool_calls â†’ `answer`)
- [X] T025 [US4] Wire empty-input short-circuit and iteration limit (T020/T022) so ReAct returns partial trace + limit answer; on real model failure return partial trace + unavailability answer without throwing past the strategy boundary
- [X] T026 [US4] Export `name: "react"` and `run(input, { maxIterations })` conforming to `ReasoningStrategy` from `src/agents/react.ts`

**Checkpoint**: ReAct alone satisfies US3/US4 without Plan-and-Execute or arena

---

## Phase 7: User Story 5 - Planejar, executar um passo e revisar o resto (Priority: P2)

**Goal**: Grafo Plan-and-Execute (planner â†’ executor â†’ replanner), mÃ¡x. 8 passos, `maxIterations` menor corta antes.

**Independent Test**: Rodar sÃ³ Plan-and-Execute; rastro tem `plan`, passos um a um e `critique`; passos executados â‰¤ 8 e â‰¤ `maxIterations`.

### Implementation for User Story 5

- [X] T027 [US5] Define Plan-and-Execute graph state in `src/agents/plan-and-execute.ts` (`input`, `steps`, `stepsTaken`, observations, `answer`, `trace`, `llmCalls`, `maxIterations`)
- [X] T028 [US5] Implement `planner` node with structured output (list of step strings), emit `plan` event, count LLM call
- [X] T029 [US5] Implement `executor` node that runs one step with the ops tools, appends thought/action/observation as needed, increments `stepsTaken`
- [X] T030 [US5] Implement `replanner` node that emits `critique`, returns remaining steps or empty list + final `answer`, and stops when steps empty
- [X] T031 [US5] Add conditional edges so execution continues only while steps remain, `stepsTaken < 8`, and `stepsTaken < maxIterations`; never execute a 9th step
- [X] T032 [US5] Export `name: "plan-and-execute"` and `run(input, { maxIterations })` as `ReasoningStrategy`, reusing empty-input and failure handling from US3

**Checkpoint**: Both strategies implement the shared contract independently

---

## Phase 8: User Story 6 - Comparar estratÃ©gias no mesmo pedido (Priority: P2)

**Goal**: Arena CLI valida flags, roda 1+ estratÃ©gias no mesmo input e imprime rastros e mÃ©tricas.

**Independent Test**: `npm run arena -- --strategies react,plan-and-execute --max-iterations 8 --input "..."` imprime dois blocos; seleÃ§Ã£o vazia ou nome desconhecido sai com cÃ³digo 1 sem chamar o modelo.

### Implementation for User Story 6

- [X] T033 [US6] Implement Zod CLI parsing in `src/arena.ts` for `--strategies` (comma-separated unique subset of `react`|`plan-and-execute`, at least one), `--max-iterations` (integer â‰¥ 1, default 8), and `--input` (trim; blank = empty request)
- [X] T034 [US6] Map domain errors (empty selection, unknown strategy name, invalid max-iterations, missing OpenRouter config for non-empty input) to stderr messages and exit code 1 without invoking any strategy
- [X] T035 [US6] For each selected strategy, call `run` with the same input and `maxIterations`, print strategy name, `formatTrace` output, then `llmCalls` and `latencyMs` per `contracts/arena-cli.md`
- [X] T036 [US6] Keep `npm run arena` in `package.json` pointing at `tsx src/arena.ts` and ensure success path exits 0 (including empty input with valid strategies)

**Checkpoint**: Plantonista compara estratÃ©gias end-to-end via CLI

---

## Phase 9: User Story 7 - Conferir catÃ¡logo e rastro sem sair do ambiente (Priority: P3)

**Goal**: Duas conferÃªncias seguidas do catÃ¡logo e da formataÃ§Ã£o de rastro produzem o mesmo resultado, sem contato externo.

**Independent Test**: `npm test` cobre store + `formatTrace` duas vezes com resultado idÃªntico; nenhum teste abre rede ou MySQL.

### Tests for User Story 7

- [X] T037 [P] [US7] Strengthen `src/agents/store.test.ts` so the primary-catalog-backed store summary is asserted twice in one test with deep equality (5/6/3/3) and no I/O
- [X] T038 [P] [US7] Strengthen `src/agents/trace.test.ts` so a fixture covering all six event types formats identically on two consecutive calls and includes tool+args on `action`

### Implementation for User Story 7

- [X] T039 [US7] Ensure store and trace modules under test import only pure modules (no Sequelize, no `ChatOpenAI` invoke) and remove any accidental network/db imports from those test files
- [X] T040 [US7] Run `npm test` and `npm run typecheck`; fix failures until both are green

**Checkpoint**: Offline deterministic guarantees of FR-020 hold

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: ValidaÃ§Ã£o cruzada e alinhamento com o quickstart

- [X] T041 [P] Walk `specs/001-nucleo-raciocinio/quickstart.md` scenarios 1â€“5 against the implemented CLI and note any contract drift in comments only if a code fix is required
- [X] T042 Confirm `.env.example` documents `OPENROUTER_*` and `DB_*` without committing secrets; verify no source file reads `.env`
- [X] T043 Final gate: `npm run typecheck` and `npm test` green after all stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **US1 (Phase 3)**: After Foundational - MVP (seed already mostly done; list alerts completes the story)
- **US2 (Phase 4)**: After Foundational; uses store from Phase 2; can follow US1 sequentially (same `store.ts`/`tools.ts` files)
- **US3 (Phase 5)**: After Foundational; trace/strategy helpers before US4/US5
- **US4 (Phase 6)**: After US1â€“US3 tools + limiter + trace mapping
- **US5 (Phase 7)**: After US1â€“US3; parallelizable with US4 if different owners (different files: `react.ts` vs `plan-and-execute.ts`)
- **US6 (Phase 8)**: After US4 and US5 exports exist
- **US7 (Phase 9)**: After store/trace implementations (can tighten tests once US1â€“US3 land)
- **Polish (Phase 10)**: After desired stories complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational - no dependency on other stories
- **User Story 2 (P1)**: After Foundational - shares `store.ts`/`tools.ts` with US1 (implement sequentially in the same files)
- **User Story 3 (P2)**: After Foundational - independent of US1/US2 for empty-input/trace formatting; strategies later consume it
- **User Story 4 (P2)**: Needs US1 tools + US3 limiter/trace mapping
- **User Story 5 (P2)**: Needs US1 tools + US3 helpers; independent of US4 file-wise
- **User Story 6 (P2)**: Needs US4 and US5
- **User Story 7 (P3)**: Needs store + trace from earlier phases; pure offline focus

### Within Each User Story

- Tests (where listed) MUST be written and FAIL before implementation
- Pure store transitions before tool adapters
- Shared contract helpers before strategy graphs
- Strategies before arena wiring
- Story complete before moving to next priority when files overlap

### Parallel Opportunities

- T004, T005, T006 in Foundational can proceed in parallel (different files)
- T008 and T009 in US1 can run in parallel
- After US3, T023â€“T026 (US4) and T027â€“T032 (US5) can proceed in parallel on different files
- T037 and T038 in US7 can run in parallel
- T041 and T042 in Polish can run in parallel

---

## Parallel Example: User Story 1

```bash
# Tests first:
Task: "Add failing store tests in src/agents/store.test.ts ..."
Task: "Confirm existing catalog tests in src/seed/primary-catalog.test.ts ..."

# Then implementation:
Task: "Implement pure listAlerts(store, status) in src/agents/store.ts ..."
Task: "Implement Zod-validated list_alertas tool in src/agents/tools.ts ..."
```

## Parallel Example: User Stories 4 and 5

```bash
# After US3 completes:
Task: "Implement reactStrategy in src/agents/react.ts ..."
Task: "Define Plan-and-Execute graph state in src/agents/plan-and-execute.ts ..."
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (seed + list alerts)
4. **STOP and VALIDATE**: `npm run seed` (if MySQL up) + store/list tests
5. Demo the plantÃ£o retrato without any LLM

### Incremental Delivery

1. Setup + Foundational â†’ shared contract ready
2. US1 â†’ list alerts / seed â†’ MVP
3. US2 â†’ open/resolve incident
4. US3 â†’ answer/trace/metrics helpers
5. US4 â†’ ReAct
6. US5 â†’ Plan-and-Execute
7. US6 â†’ Arena comparison
8. US7 â†’ offline determinism hardening
9. Polish â†’ quickstart + typecheck/test green

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational:
   - Dev A: US1 then US2 (store/tools)
   - Dev B: US3 (trace/strategy/limiter)
3. After US1â€“US3:
   - Dev A: US4 (`react.ts`)
   - Dev B: US5 (`plan-and-execute.ts`)
4. Together: US6 arena, then US7 + polish

---

## Notes

- [P] tasks = different files, no dependencies on incomplete sibling tasks
- [Story] label maps task to US1â€“US7 from spec.md
- Seed/MySQL path already exists; US1 tasks verify and complete listing, not rewrite Sequelize unless drift is found
- Never commit secrets; never read `.env` from application code
- Each task should leave `npm run typecheck` and `npm test` green before the next commit-sized slice
- Avoid: vague tasks, editing the same file in two parallel [P] tasks, skipping the shared contract
