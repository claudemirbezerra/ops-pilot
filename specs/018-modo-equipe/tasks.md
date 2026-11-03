# Tasks: Modo equipe

**Input**: Design documents from `/specs/018-modo-equipe/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — spec FR-016 / SC-006 / Independent Tests das US1–US4; constituição princípio V; quickstart sem rede. Escrever o teste da história antes da implementação e vê-lo falhar.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`
- War room: `web/src/lib/trace.ts` (suíte própria em `web/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueletos em `src/team/` sem mudar o `/chat`

- [ ] T001 [P] Create `src/team/board.ts` exporting type `Blackboard` and stubs `emptyBoard`, `applyRoleUpdate`, `renderBoard` that throw `Error("not implemented")` per `specs/018-modo-equipe/data-model.md`
- [ ] T002 [P] Create `src/team/policy.ts` exporting stubs `TEAM_MAX_HANDOFFS`, `parseTeamDecision`, `buildHandoffEvent`, `ceilingAnswer`, `resolveTeamToolUse`, allowlist constants and prompt constants that throw `Error("not implemented")` per `specs/018-modo-equipe/contracts/team-mode.md`
- [ ] T003 [P] Create `src/team/team-graph.ts` exporting types `TeamSupervisor` and `TeamRole`, plus stubs `runTeamGraph` and `teamStrategy` that throw `Error("not implemented")` per `specs/018-modo-equipe/contracts/team-mode.md`
- [ ] T004 [P] Create `src/team/board.test.ts`, `src/team/policy.test.ts` and `src/team/team-graph.test.ts` with `node:test` imports of those stubs (`test.todo` or failing placeholders OK)

**Checkpoint**: Módulos novos existem; o chat ainda não conhece `team`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, erros e funções puras do quadro, da decisão e do teto — bloqueia todas as user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Extend `src/agents/strategy.ts`: add `team` to `ProductionRoute`, `TraceNode` and `StrategyName`; add `TraceEvent` variant `{ type: "handoff"; next: "analista" | "planejador" | "executor" | "encerrar"; brief: string; node?: TraceNode }` (`node` stays optional); add optional `requestMessage?: string` on `StrategyOptions`. Do not require `node` on arena literals
- [ ] T006 [P] Add `InvalidTeamDecisionError` and `InvalidTeamRoleError` in `src/domain/errors.ts`, both extending `DomainError`, with default messages exactly `Não foi possível decidir o próximo papel.` and `Não foi possível cumprir o papel.`
- [ ] T007 [P] Implement `src/team/board.ts`: `emptyBoard(request)` sets `request` to that string, `findings` to `""`, `plan` to `[]`, `incident` to `""`. `applyRoleUpdate` — analista only changes `findings` (if the new text is non-empty and findings already has text, concatenate with `\n`); planejador only replaces `plan`; executor only changes `incident` (same non-empty concatenate-with-`\n` rule); updates aimed at another role's field are ignored; `request` never changes. `renderBoard` returns JSON text with keys in this order: `request`, `findings`, `plan`, `incident`
- [ ] T008 Implement `src/team/policy.ts` after T005: `TEAM_MAX_HANDOFFS = 8`. `parseTeamDecision` accepts only `next` equal to `analista`, `planejador`, `executor` or `encerrar`, and `brief` whose `trim()` has length ≥ 1; otherwise throw `InvalidTeamDecisionError` and do not leak model text; return the trimmed brief. `buildHandoffEvent` returns `{ type: "handoff", next, brief, node: "team" }`. `ceilingAnswer()` returns `buildLimitReachedAnswer(8)` from `src/agents/strategy.ts` (exactly `Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).`). Allowlists, exact tool names only: analista `list_alertas`, `list_incidents`, `consultar_runbook`, `check_provider_status`; planejador empty; executor `open_incident`, `resolver_incident`. Prompt constants must contain these literal sentences: analista `Relate apenas fatos. Não proponha abertura, resolução, plano de passos nem próxima ação.`; planejador `Não chame ferramentas.`; executor `Não contorne a aprovação humana.`
- [ ] T009 In `src/agents/trace.ts` `formatTrace`, add an exhaustive `handoff` branch that throws `Error("not implemented")` so `tsc` stays green until US3 replaces it
- [ ] T010 [P] Replace placeholders in `src/team/board.test.ts`: second analista visit appends findings with `\n` and leaves `plan` untouched; planejador replaces `plan` only; executor appends `incident` only; `request` stays the original string; `renderBoard` includes all four keys
- [ ] T011 [P] Replace placeholders in `src/team/policy.test.ts`: `parseTeamDecision` rejects missing `next`, `next` outside the four values, and blank `brief`; accepts a trimmed brief; `buildHandoffEvent` always sets `node` to `team`; `ceilingAnswer()` equals the exact teto sentence; each prompt constant contains its required sentence; allowlists match the three lists above and nothing else
- [ ] T012 Run `npm run typecheck` and `node --import tsx --test src/team/board.test.ts src/team/policy.test.ts` until green

**Checkpoint**: Quadro, decisão e teto puros prontos — US1 pode montar o grafo

---

## Phase 3: User Story 1 - O supervisor conduz a equipe sobre um quadro (Priority: P1) 🎯 MVP

**Goal**: Um supervisor lê o quadro do turno, decide `{ next, brief }`, emite `handoff` e só então um papel escreve a sua parte. `encerrar` não chama papel e o `brief` é a resposta. Papéis não escolhem o próximo.

**Independent Test**: `runTeamGraph` com supervisor falso `analista` → `planejador` → `encerrar`. O planejador vê os achados do analista. A resposta é o `brief` de `encerrar`. Nenhum papel escolhe `next`.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T013 [US1] Add failing cases in `src/team/team-graph.test.ts`: (1) supervisor returns `analista`, then `planejador`, then `encerrar` — analista `findings` are visible on the blackboard passed into the planejador; planejador steps replace `plan` only; answer equals the `encerrar` brief; each `handoff` (`node: "team"`, same `next` and `brief`) is appended before that role's events; role fakes are never asked to pick `next`. (2) first decision `encerrar` — one `handoff`, zero role runs, answer is that brief. (3) `brief` of only spaces — throw `InvalidTeamDecisionError` with message `Não foi possível decidir o próximo papel.`, and that decision appends no `handoff`

### Implementation for User Story 1

- [ ] T014 [US1] Implement `runTeamGraph` in `src/team/team-graph.ts` as a per-call `StateGraph`. State holds `prompt`, `blackboard`, `handoffs` (start 0), `trace`, `answer`, `llmCalls`, `promptTokens`, `modelUsed`, `pendingApproval`, `done`. Edges: `START → supervisor`; `done → END`; otherwise `analista` / `planejador` / `executor` run once and return to `supervisor`. Supervisor calls the injected `TeamSupervisor.decide({ prompt, blackboard })`, then `parseTeamDecision`, then appends `buildHandoffEvent` and increments `handoffs` by 1. `encerrar` sets `answer` to the trimmed brief and `done` without calling a role. Role nodes call `applyRoleUpdate` only. `emptyBoard` uses `requestMessage` (empty string when omitted). Invoke with `recursionLimit: TEAM_MAX_HANDOFFS * 2 + 4`. Do not call `createModel`. Do not add the ceiling stop in this task (US4); US1 fakes always `encerrar` by the third decision. `teamStrategy.name` is `team` and `teamStrategy.run` delegates to `runTeamGraph` with the built prompt plus `options.requestMessage`

- [ ] T015 [US1] Run `node --import tsx --test src/team/team-graph.test.ts` and `npm run typecheck` until green

**Checkpoint**: MVP — supervisor, quadro e encerramento testáveis sem chat e sem modelo

---

## Phase 4: User Story 2 - Cada papel só faz a sua parte (Priority: P1)

**Goal**: Analista só lê e não escreve o plano. Planejador não tem ferramentas. Executor só pede incidente e para na aprovação humana antes de gravar.

**Independent Test**: Allowlist e prompts puros; uma ferramenta fora da lista não é invocada; `open_incident` lança espera sem chamar a função; o grafo com executor pendente termina sem o papel seguinte.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T016 [P] [US2] Add failing cases in `src/team/policy.test.ts` for `resolveTeamToolUse(role, toolName)`: check the allowlist first, then the human-approval gate. Analista names `open_incident`, `resolver_incident` or `forget_preference` → `{ kind: "deny" }` (not approval). Analista names `list_alertas` → `{ kind: "invoke" }`. Planejador and any tool name → `{ kind: "deny" }`. Executor names `open_incident` or `resolver_incident` → `{ kind: "approval" }`. Executor names `list_alertas` → `{ kind: "deny" }`
- [ ] T017 [P] [US2] Add failing cases in `src/team/team-graph.test.ts`: (1) executor port returns `pendingApproval` for `open_incident` — graph ends, the supervisor is not called again, trace is the executor `handoff` then `{ type: "action", tool: "open_incident", node: "team" }`, and there is no success `observation`. (2) a deny observation uses the exact text `Ferramenta indisponível para este papel.` (3) planejador port returns steps `["Ler alertas", "Abrir incidente"]` — blackboard `plan` is that array and trace contains `{ type: "plan", steps: that array, node: "team" }` after the planejador `handoff`. (4) empty `steps` or a blank step surfaces `InvalidTeamRoleError` with message `Não foi possível cumprir o papel.`

### Implementation for User Story 2

- [ ] T018 [US2] Implement `resolveTeamToolUse` in `src/team/policy.ts` with the allowlist-then-approval order from T016. Use `requiresHumanApproval` from `src/agents/approval-gate.ts` only after the name is on that role's allowlist
- [ ] T019 [US2] In `src/team/team-graph.ts`, apply role results from T017: analista writes `findings` and emits `action`/`observation` pairs with `node: "team"` (plus one `observation` when the analyst prose is non-empty); planejador writes `plan`, emits one `plan` event, and rejects an empty list or a blank trimmed step with `InvalidTeamRoleError` before writing; executor on `{ kind: "approval" }` throws `HumanApprovalRequiredError` before the tool function runs, then the node sets `pendingApproval` via `describePendingApproval`, appends the `action`, and ends the graph (`done`) so the next supervisor call does not happen. A denied tool name is not invoked and its observation is exactly `Ferramenta indisponível para este papel.` Add `createTeamRoles` for production: filter `createOpsTools` by the role allowlist; planejador uses `withStructuredOutput({ steps: string[] })` and must not call `bindTools`; executor never calls the underlying `open_incident` / `resolver_incident` function. Tests keep injecting fakes and must not call `createModel`

- [ ] T020 [US2] Run `node --import tsx --test src/team/policy.test.ts src/team/team-graph.test.ts` and `npm run typecheck` until green

**Checkpoint**: Papéis separados; incidente não grava sem aprovação

---

## Phase 5: User Story 3 - A passagem de bastão aparece em ver raciocínio (Priority: P1)

**Goal**: Cada `handoff` aparece no painel atual como tipo `handoff` e texto `{next}: {brief}`. O formatador do servidor mostra o mesmo texto.

**Independent Test**: `formatTraceEvent` de um handoff do analista devolve `analista: Ler os alertas em disparo.` `formatTrace` inclui o bloco `[handoff]` e essa mesma linha. Nenhum painel novo.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T021 [P] [US3] Add a failing case in `web/src/lib/trace.test.ts`: `formatTraceEvent({ type: "handoff", next: "analista", brief: "Ler os alertas em disparo." })` equals `analista: Ler os alertas em disparo.` Extend the local `TraceEvent` union so this object typechecks
- [ ] T022 [P] [US3] Add a failing case in `src/agents/trace.test.ts`: `formatTrace` of that same handoff contains the block `[handoff]` and the line `analista: Ler os alertas em disparo.`

### Implementation for User Story 3

- [ ] T023 [P] [US3] In `web/src/lib/trace.ts`, add the `handoff` variant (`next: string`, `brief: string`, optional `node`) and make `formatTraceEvent` return `` `${next}: ${brief}` ``. Do not edit `web/src/components/TracePanel.tsx` — it already prints `event.type`
- [ ] T024 [P] [US3] Replace the `handoff` throw in `src/agents/trace.ts` `formatTrace` with `[handoff]\n` plus `` `${next}: ${brief}` ``. Leave the other branches unchanged
- [ ] T025 [US3] Run `npm test` and `npm run typecheck` in `web/`, plus `node --import tsx --test src/agents/trace.test.ts` at the repo root, until green

**Checkpoint**: Ver raciocínio e o log mostram papel e brief

---

## Phase 6: User Story 4 - A rota team entra no plantão com teto 8 (Priority: P1)

**Goal**: `team` é a quarta rota de produção. Override não consulta o roteador. O prompt do roteador tem quatro linhas e proíbe uma quinta. Oito decisões sem `encerrar` devolvem o aviso de teto. Decisão ilegível é 502 com a mensagem do papel ou do supervisor, distinta da rota.

**Independent Test**: `strategy: "team"` marca override e não chama `decide` do roteador. Oitava decisão de papel executa e não há nona. `Team` continua 422. Supervisor ilegível → 502 `Não foi possível decidir o próximo papel.`

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T026 [P] [US4] Update `src/agents/production-route.test.ts`: `isProductionRoute("team")` is true; `isProductionRoute("Team")` is false; `ROUTER_PROMPT` contains the four spec rows (direct action → `react`, dependent sequence by the same agent → `plan-and-execute`, review → `reflection`, separated roles → `team`) and the sentence `Não invente uma quinta rota.`; replace the assertion on `Não invente uma quarta rota`. `resolveProductionStrategy({ route: "team", reflect: true })` returns the registry `team` strategy, does not call the critic, and does not wrap
- [ ] T027 [P] [US4] Add failing cases in `src/agents/production-graph.test.ts`: override `team` never calls router `decide`, route event is `{ type: "route", route: "team", reason: "Estratégia informada no pedido.", override: true, node: "router" }`, and only the team fake runs. A router fake returning `team` runs only that fake with `override: false`. `reflect: true` on that override still does not call the critic
- [ ] T028 [P] [US4] Add failing cases in `src/team/team-graph.test.ts`: eight role decisions and no `encerrar` — the eighth role runs, `decide` is not called a ninth time, answer is exactly `Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).`. Eighth decision `encerrar` returns that brief, not the ceiling sentence
- [ ] T029 [P] [US4] Add failing cases in `src/http/server.test.ts` using injected registry/router (no OpenRouter): non-blank `strategy: "team"` → 200 route event override true and fixed reason, router `decide` not called. Router fake returns `team` → only team runs. `strategy: "Team"` with a non-blank message → 422 citing `Team`. Blank message plus `strategy: "team"` → 200 empty-input answer, no `route`, no `handoff`. Fake team run that throws `InvalidTeamDecisionError` → 502 `{ message: "Não foi possível decidir o próximo papel." }` without `answer` / `trace` / `metrics`. Fake that throws `InvalidTeamRoleError` → 502 `{ message: "Não foi possível cumprir o papel." }`. Fake `pendingApproval` for `open_incident` plus a `handoff` → 202 whose `trace` includes that `handoff`

### Implementation for User Story 4

- [ ] T030 [US4] In `src/agents/production-route.ts`, add `team` to `PRODUCTION_ROUTES`. Rewrite `ROUTER_PROMPT` to the four-row table from `specs/018-modo-equipe/spec.md` (User Story 4), say four routes, and end with `Não invente uma quinta rota.` In `resolveProductionStrategy`, return `registry.team` with no `wrapWithReflection` when `route === "team"`, whether or not `reflect` is true. Leave `react`, `plan-and-execute` and `reflection` behavior unchanged
- [ ] T031 [P] [US4] In `src/agents/production-graph.ts`, add `team` to the router Zod enum. Add a `team` node that uses the same `runStrategy` path as the others, passing `requestMessage: state.message`. Add conditional edge `team: "team"` and `team → response`. Do not call the router model when override is `team`
- [ ] T032 [P] [US4] At the start of the supervisor node in `src/team/team-graph.ts`, if `handoffs >= TEAM_MAX_HANDOFFS`, do not call `decide`, do not append a handoff, set `answer` to `ceilingAnswer()`, and `done`. An eighth `encerrar` still wins inside that eighth decision, before the next entry
- [ ] T033 [P] [US4] Register `team: teamStrategy` on `channelStrategies` in `src/agents/index.ts`. Do not teach `resolveChannelStrategy` to wrap `team`. Do not add `team` to `src/arena.ts` or `src/bench.ts`
- [ ] T034 [P] [US4] In `src/http/server.ts`, map `InvalidTeamDecisionError` and `InvalidTeamRoleError` to 502 `{ message: error.message }` next to the existing `InvalidRouteError` branch. Do not change 400, 422, 504 or 503
- [ ] T035 [US4] Run `npm run typecheck` and `node --import tsx --test src/agents/production-route.test.ts src/agents/production-graph.test.ts src/team/team-graph.test.ts src/http/server.test.ts` until green

**Checkpoint**: Chat aceita a rota `team`, respeita o teto 8 e os 502 novos

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quickstart, fronteira da arena e suíte completa

- [ ] T036 [P] Walk `specs/018-modo-equipe/quickstart.md` and fix doc drift only if a command or expected sentence no longer matches the code
- [ ] T037 Confirm `src/arena.ts` and `src/bench.ts` do not register or invoke `team`, and that no new code reads a `.env` file
- [ ] T038 Final green run: `npm run typecheck` and `npm test` at the repo root, plus `npm run typecheck` and `npm test` in `web/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP graph with fakes
- **US2 (Phase 4)**: After US1 — role results and the approval stop plug into `runTeamGraph`
- **US3 (Phase 5)**: After Foundational T009 — formatters only; can proceed in parallel with US1/US2
- **US4 (Phase 6)**: After US1 and US2 — production route, ceiling, HTTP
- **Polish (Phase 7)**: After the desired stories

### User Story Dependencies

- **US1 (P1)**: Foundational only — no chat route yet
- **US2 (P1)**: Needs the US1 graph so pending executor ends the loop
- **US3 (P1)**: Needs the `handoff` type from Foundational, not the chat route. Independent of US2
- **US4 (P1)**: Needs US1 graph and US2 pending/role errors so HTTP 202 and 502 have something to map

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure helpers before the graph
- Graph before the HTTP edge
- Story checkpoint before the next priority that edits the same file

### Parallel Opportunities

- T001–T004 can run together
- T005, T006 and T007 can run together; T008 and T009 wait on T005; T010 and T011 can run together after their modules
- US3 (T021–T024) can run beside US1/US2
- T016 and T017 can run together
- T026–T029 can run together; after T030, T031–T034 can run together

---

## Parallel Example: User Story 2

```bash
# Tests in different files:
Task: "T016 resolveTeamToolUse cases in src/team/policy.test.ts"
Task: "T017 pending executor and plan events in src/team/team-graph.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T021 formatTraceEvent handoff in web/src/lib/trace.test.ts"
Task: "T022 formatTrace handoff in src/agents/trace.test.ts"

# Then implementations:
Task: "T023 web/src/lib/trace.ts"
Task: "T024 src/agents/trace.ts"
```

## Parallel Example: User Story 4

```bash
Task: "T026 src/agents/production-route.test.ts"
Task: "T027 src/agents/production-graph.test.ts"
Task: "T028 ceiling cases in src/team/team-graph.test.ts"
Task: "T029 src/http/server.test.ts"
```

US1 is sequential: one test file, then `src/team/team-graph.ts`.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `runTeamGraph` with fakes shows the blackboard, the handoffs and the `encerrar` brief
5. Chat still has no `team` route until US4

### Incremental Delivery

1. Setup + Foundational → pure board and decision
2. US1 → supervisor loop (MVP graph)
3. US2 → role boundaries and approval stop
4. US3 → ver raciocínio (can land as soon as Foundational is done)
5. US4 → route `team`, ceiling 8, 502/202 on `/chat`
6. Polish → root and `web/` suites green

### Parallel Team Strategy

1. Everyone finishes Setup + Foundational
2. Then:
   - Developer A: US1 then US2 (`src/team/team-graph.ts`)
   - Developer B: US3 (trace formatters)
3. After A finishes US2, anyone can take US4

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 is the graph MVP; the plantonista-facing route is US4
- Verify tests fail before implementing
- Commit after each task or logical group
- Do not add a new trace panel, a SQLite table, or an arena/bench entry for `team`
