# Tasks: Camada Reflection

**Input**: Design documents from `/specs/002-camada-reflection/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Incluídos. FR-014 e a User Story 5 pedem conferência determinística do ciclo (teto, `critique`, métricas) sem rede. A constituição exige teste em lógica nova.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` at repository root; tests as `src/**/*.test.ts` (matches `npm test`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Abrir os módulos previstos no plan.md sem alterar o comportamento do núcleo `001`.

- [ ] T001 Create stub modules `src/agents/reflection.ts` and `src/agents/critic.ts` exporting placeholder symbols so TypeScript ESM paths resolve
- [ ] T002 Confirm `npm run typecheck` and `npm test` stay green on the existing `001` agents/arena before reflection logic lands

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos compartilhados, erro de domínio do teto e helpers puros. Bloqueia todas as user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Add `InvalidMaxReflectionsError` (extends `DomainError`) in `src/domain/errors.ts` for teto de reflexões menor que 1
- [ ] T004 Extend `StrategyOptions` in `src/agents/strategy.ts` with `maxReflections` (inteiro ≥ 1; default semantics documented as 2 at the arena border) and widen strategy `name` to include `"reflect:react"` | `"reflect:plan-and-execute"` alongside `"react"` | `"plan-and-execute"`
- [ ] T005 [P] Define `CritiqueDecision` (`approved`: boolean; `feedback`: string, may be empty) and injectable `Critic` port `evaluate({ input, answer, observations })` in `src/agents/critic.ts` per `contracts/reflection-layer.md` and `data-model.md`
- [ ] T006 [P] Implement pure helpers in `src/agents/reflection.ts`: `extractObservations(trace)` (`type === "observation"`), `buildFeedbackInput(original, feedback)` (pedido original intacto + bloco de feedback; empty/whitespace feedback on reject → texto padrão de reprovação sem detalhe), `formatCritiqueContent(decision)` (legível: aprovação/reprovação + feedback), `ensureFinalAnswer(trace, answer)` (último evento é `answer` com o mesmo `content` que `answer`)

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 - Revisar a resposta antes de confiar nela (Priority: P1) 🎯 MVP

**Goal**: Envolver a base com reflexão: base roda primeiro; crítico devolve `approved`/`feedback`; rastro ganha evento `critique`; contrato comum preservado.

**Independent Test**: Com base e crítico simulados (crítico aprova), `wrapWithReflection(...).run` devolve `answer`/`trace`/`metrics` e o rastro contém ao menos um `critique` além do `answer` final.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T007 [P] [US1] Add failing tests in `src/agents/reflection.test.ts`: mock base runs once then mock critic approves; result has a `critique` event; last event is `answer` matching `result.answer`; empty/whitespace `input` returns empty-input shape and never calls the critic (FR-013)

### Implementation for User Story 1

- [ ] T008 [US1] Implement production `createLlmCritic` in `src/agents/critic.ts` using `createModel()` + `withStructuredOutput` Zod schema `{ approved: boolean, feedback: string }`, temperature 0 / same OpenRouter factory; prompt includes pedido, resposta candidata, and observations (absence of observations must not block evaluation)
- [ ] T009 [US1] Implement `wrapWithReflection({ base, critic, name })` in `src/agents/reflection.ts` per `contracts/reflection-layer.md` steps 1–7 for the approve path: run base first with `maxIterations`, then critic, append `critique` via `formatCritiqueContent`, on `approved` call `ensureFinalAnswer` and return; do not invent critique when blank input short-circuits
- [ ] T010 [US1] Wire factory helpers `reflectReactStrategy` / `reflectPlanAndExecuteStrategy` (or equivalent) in `src/agents/reflection.ts` that wrap `reactStrategy` / `planAndExecuteStrategy` with `createLlmCritic` and names `"reflect:react"` / `"reflect:plan-and-execute"`

**Checkpoint**: US1 independently testable offline with approving critic stub

---

## Phase 4: User Story 2 - Regenerar quando a crítica reprova (Priority: P1)

**Goal**: Reprovação dispara regeneração com feedback no contexto até aprovação ou teto (`maxReflections` conta regenerações após reprovação; padrão 2; primeira passagem da base não consome o teto).

**Independent Test**: Crítico que sempre reprova + `maxReflections = 2` → no máximo 2 regenerações após a base inicial; rastro com todos os `critique`; resposta = última tentativa da base.

### Tests for User Story 2

- [ ] T011 [P] [US2] Extend `src/agents/reflection.test.ts` with failing cases: always-reject critic + `maxReflections: 2` yields ≤ 2 regenerations after initial base run (≤ 3 `base.run` total) and matching `critique` count; approve on first critique yields zero regenerations; empty feedback on reject still regenerates using default reject text in `buildFeedbackInput`

### Implementation for User Story 2

- [ ] T012 [US2] Complete the regeneration loop in `src/agents/reflection.ts`: on reject with regenerations remaining, rebuild input via `buildFeedbackInput`, decrement remaining (`regenerações_restantes` starts at `maxReflections`), re-run base; on teto esgotado return last base answer with full critique history and `ensureFinalAnswer`
- [ ] T013 [US2] Handle critic unavailability in `src/agents/reflection.ts`: catch evaluate failure, append legible `critique` declaring indisponibilidade (sem inventar aprovação), return last base answer; if base fails before a candidata útil on the first pass, propagate base result without inventing a critique

**Checkpoint**: US1 + US2 cycle (approve / regenerate / ceiling / critic down) works with stubs

---

## Phase 5: User Story 3 - Contar o custo da reflexão (Priority: P2)

**Goal**: `metrics.llmCalls` soma bases + crítico (+ regenerações); `metrics.latencyMs` é tempo de parede do ciclo completo.

**Independent Test**: Stub base com `llmCalls` conhecidos + stub crítico que conta 1 por evaluate; após uma crítica (e opcional regeneração), `result.metrics.llmCalls` equals the sum; `latencyMs` ≥ soma parcial e cobre o ciclo.

### Tests for User Story 3

- [ ] T014 [P] [US3] Extend `src/agents/reflection.test.ts` with failing assertions: `llmCalls` equals sum of each `base.run` metrics plus critic calls; `latencyMs` is wall-clock of the wrapper (not merely last base latency)

### Implementation for User Story 3

- [ ] T015 [US3] Accumulate `llmCalls` across base runs and production critic invocations inside `wrapWithReflection` in `src/agents/reflection.ts` (stubs may contribute 0 for critic); measure `latencyMs` with a single wall-clock span around the full loop per `contracts/reflection-layer.md` and FR-009

**Checkpoint**: Metrics of a reflected run honestly include critic and regenerations

---

## Phase 6: User Story 4 - Escolher reflexão na arena (Priority: P2)

**Goal**: Arena aceita `reflect:react` e `reflect:plan-and-execute` (além das bases), `--max-reflections` (inteiro ≥ 1, ausente → 2), recusa nomes/`max-reflections` inválidos antes do modelo.

**Independent Test**: `parseArenaArgs` aceita os novos nomes e default 2; rejeita `reflect:foo` e `--max-reflections 0` com erro de domínio e sem precisar de rede.

### Tests for User Story 4

- [ ] T016 [P] [US4] Extend `src/agents/arena-args.test.ts` with failing cases: `--strategies reflect:react` and `reflect:plan-and-execute` parse; absent `--max-reflections` defaults to 2; `reflect:foo` throws `UnknownStrategyError` citing the name; `--max-reflections 0` throws `InvalidMaxReflectionsError`; bases `react`/`plan-and-execute` still parse; duplicate names still invalid

### Implementation for User Story 4

- [ ] T017 [US4] Update Zod/`parseArenaArgs` in `src/arena.ts` to accept strategy enum `react` | `plan-and-execute` | `reflect:react` | `reflect:plan-and-execute`, parse `--max-reflections` (inteiro ≥ 1, default 2), throw domain errors before any model call per `contracts/arena-cli.md`
- [ ] T018 [US4] Register reflected strategies in `strategiesByName` inside `src/arena.ts`, pass `{ maxIterations, maxReflections }` into `run`, and keep stdout contract (`strategy=<name>`, formatted trace, `metrics.llmCalls` / `metrics.latencyMs`)

**Checkpoint**: Arena can select and print reflected strategies; invalid flags fail closed

---

## Phase 7: User Story 5 - Conferir o ciclo de reflexão sem rede (Priority: P3)

**Goal**: Conferência repetível offline do teto, eventos `critique` e formatação idêntica (FR-014 / SC-006).

**Independent Test**: Mesmos stubs + mesmo teto, duas execuções → mesma regra de parada e `formatTrace` idêntico incluindo `[critique]`.

### Tests for User Story 5

- [ ] T019 [P] [US5] Extend `src/agents/reflection.test.ts` so the always-reject + `maxReflections: 2` scenario run twice yields identical `formatTrace(result.trace)` text (includes `[critique]`) and the same stop rule; assert no network imports/calls in the test path

### Implementation for User Story 5

- [ ] T020 [US5] Close any gaps so stub-only paths in `src/agents/reflection.ts` / `src/agents/critic.ts` never touch OpenRouter; export test-friendly `wrapWithReflection` injection points if still missing; keep `npm test` fully offline for this suite

**Checkpoint**: FR-014 / SC-006 satisfied without external services

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verificação final alinhada ao quickstart e qualidade da suíte.

- [ ] T021 [P] Align comments/exports in `src/agents/reflection.ts` and `src/agents/critic.ts` with `specs/002-camada-reflection/contracts/reflection-layer.md` (no behavior drift)
- [ ] T022 Run `npm run typecheck` and `npm test` green; smoke-check scenarios listed in `specs/002-camada-reflection/quickstart.md` §§1 and 5 (offline + arena border cases) and fix any remaining gaps in `src/arena.ts` / tests

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Stories (Phases 3–7)**: Depend on Foundational
  - US1 → US2 (regeneration extends the wrap loop)
  - US3 can follow US2 (metrics sit on the completed loop) or land with US2 if careful
  - US4 needs US1 factories at minimum (prefer after US2/US3 so arena demos full cycle)
  - US5 consolidates offline guarantees; can start after US2 tests exist
- **Polish (Phase 8)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — MVP
- **US2 (P1)**: After US1 wrap skeleton
- **US3 (P2)**: After US2 loop (or concurrent with T012 if metrics wired in the same file carefully — prefer after)
- **US4 (P2)**: After reflected strategy factories (T010) and preferably after US2/US3
- **US5 (P3)**: After US2 offline regeneration tests; strengthens FR-014

### Within Each User Story

- Tests (included) MUST be written and FAIL before implementation
- Pure helpers / types before IO (critic LLM, wrap loop)
- Story complete before moving to next priority when sequencing solo

### Parallel Opportunities

- T005 and T006 in Foundational can run in parallel
- T007 (US1 tests) alone until T008/T009
- T011 / T014 / T016 / T019 test tasks touch the same `reflection.test.ts` / `arena-args.test.ts` — **do not** parallelize writes to the same file; sequence or split files if staffing
- T021 can run beside manual quickstart checks once implementation is done

---

## Parallel Example: User Story 1

```bash
# After Foundational, one agent:
Task: "T007 failing reflection tests in src/agents/reflection.test.ts"
# Then sequential implementation:
Task: "T008 createLlmCritic in src/agents/critic.ts"
Task: "T009 wrapWithReflection approve path in src/agents/reflection.ts"
Task: "T010 reflect:* factories in src/agents/reflection.ts"
```

## Parallel Example: Foundational

```bash
Task: "T005 CritiqueDecision + Critic port in src/agents/critic.ts"
Task: "T006 pure helpers in src/agents/reflection.ts"
# After T003/T004 if those land first (errors + StrategyOptions)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 (approve + `critique` in trace)
4. **STOP and VALIDATE** with stub critic approving
5. Demo/review before regeneration

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → critique path (MVP)
3. US2 → regenerate + ceiling
4. US3 → honest metrics
5. US4 → arena `reflect:*` + `--max-reflections`
6. US5 → offline determinism lock
7. Polish → typecheck/test/quickstart borders

### Parallel Team Strategy

1. Pair completes Setup + Foundational
2. Dev A: US1 → US2 → US3 on `reflection.ts` / `critic.ts`
3. Dev B: US4 arena args/tests after T010 lands (coordinate on `src/arena.ts`)
4. Either: US5 offline hardening on `reflection.test.ts`

---

## Notes

- [P] = different files, no incomplete-task dependencies
- [Story] maps to US1–US5 from `spec.md`
- Quote constraints already embedded in task text (`maxReflections` inteiro ≥ 1, default 2; teto = regenerações; último evento `answer`)
- Commit after each task or logical group
- Stop at checkpoints to validate independently
- Avoid inventing new trace event types; reuse `critique`
