# Tasks: Canal de chat

**Input**: Design documents from `/specs/003-canal-chat/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Incluídos. A spec pede teste de integração com estratégia substituta determinística, sem rede (US6, FR-014, SC-006). A constituição exige teste em lógica nova. Os testes ficam em `src/http/server.test.ts` (`npm test` já cobre `src/**/*.test.ts`).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` at repository root; tests as `src/**/*.test.ts` (matches `npm test`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Abrir os módulos do plan.md sem mudar o comportamento de `001` e `002`.

- [X]  Create compiling stubs `src/agents/index.ts`, `src/services/chat-service.ts`, and `src/http/server.ts` (`createApp` returns an Express app with no chat route yet) so later ESM imports resolve; do not add dependencies (`express`, `zod`, `@types/express` are already in `package.json`)
- [X]  Confirm `npm run typecheck` and `npm test` stay green on the existing `src/agents/`, `src/arena.ts`, and `src/bench.ts` before chat behavior lands

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Erro de domínio do tempo esgotado e catálogo nome → estratégia. Bloqueia todas as user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X]  [P] Add `ChatTimeoutError` extending `DomainError` in `src/domain/errors.ts`. Constructor takes `timeoutMs: number`. Message MUST be `Tempo esgotado: a resposta não ficou pronta em ${seconds} segundos.` with `seconds = timeoutMs / 1000`. For `180000` the message is exactly `Tempo esgotado: a resposta não ficou pronta em 180 segundos.`
- [X]  [P] Implement `channelStrategies` and `resolveChannelStrategy` in `src/agents/index.ts` per `specs/003-canal-chat/contracts/strategy-registry.md` and `data-model.md`: production keys are exactly `react` and `plan-and-execute` (no trim, no case folding, compound names are not keys); `reflect === false` returns that base; `reflect === true` returns `wrapWithReflection` of that base with internal name `reflect:react` or `reflect:plan-and-execute` and the critic argument; any other string, including `""`, `React`, `reflect:react`, and `reflect:plan-and-execute`, throws the existing `UnknownStrategyError` with message `Estratégia desconhecida: <texto>.` before `wrapWithReflection` and before `run`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Conversar com o copiloto (Priority: P1) 🎯 MVP

**Goal**: `POST /chat` com só `message` executa ReAct (padrão) e responde 200 com `answer`, `trace` e `metrics` daquela execução. `npm run dev` deixa de terminar vazio.

**Independent Test**: Catálogo injetado em que `react` é um substituto determinístico. Dois `POST /chat` só com `message` devolvem 200 e o mesmo `answer`; `trace` e `metrics` são os da chamada. O substituto não abre rede.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X]  [US1] Add failing tests in `src/http/server.test.ts`: `createApp({ registry })` listens on `127.0.0.1` port `0`; `fetch` `POST /chat` with only `{ "message": "<texto>" }` returns 200 JSON `{ answer, trace, metrics }`; a second post of the same message returns the same `answer`; two posts with different messages do not share `trace` or `metrics`; the fake `run` receives `maxIterations: 8`; the test does not import `src/agents/model.ts`

### Implementation for User Story 1

- [X]  [US1] Implement `runChat` in `src/services/chat-service.ts` for the success path: omitted `strategy` becomes `react`; omitted `reflect` is `false` and MUST NOT wrap; call `resolveChannelStrategy`; `run(message, { maxIterations: 8, maxReflections: 2 })`; return the `StrategyResult`. `message` may be empty or whitespace (data-model: still valid, reaches `run`, HTTP stays 200). This file MUST NOT set HTTP status
- [X]  [US1] Implement `POST /chat` in `src/http/server.ts` (`express.json()`, call `runChat`, `200` with `{ answer, trace, metrics }`). `createApp` accepts optional `registry`, `critic`, and `timeoutMs` (default `180000`). In `src/index.ts`, listen on `127.0.0.1`, port `process.env.PORT` or `3000`, do not read a `.env` file, log the URL once, and guard `listen` with `import.meta.url` the same way as `src/arena.ts` so tests can import `createApp` without listening

**Checkpoint**: US1 works offline with an injected `react` fake; `npm run dev` stays up

---

## Phase 4: User Story 2 - Escolher a estratégia e a reflexão (Priority: P1)

**Goal**: `strategy` escolhe `react` ou `plan-and-execute`. `reflect: true` envolve essa base com a reflexão já existente. `reflect` omitido ou `false` não critica.

**Independent Test**: O mesmo pedido com `plan-and-execute` e `reflect: false` executa só essa base. Com `react` e `reflect: true`, o 200 traz `critique` do crítico substituto. Sem `strategy` e com `reflect: true`, a base envolvida é `react`.

### Tests for User Story 2

- [X]  [US2] Extend `src/http/server.test.ts` with failing cases: `{ message, strategy: "plan-and-execute", reflect: false }` calls only the plan-and-execute fake and not the critic; `{ message, strategy: "react", reflect: true }` returns 200 and `trace` includes one `critique` from the injected critic; omitted `strategy` plus `reflect: true` wraps the react fake; omitted `reflect` does not call the critic

### Implementation for User Story 2

- [X]  [US2] Thread `strategy` and `reflect` from `src/http/server.ts` into `runChat` in `src/services/chat-service.ts`. Absent `strategy` stays `react`. Absent `reflect` stays `false`. `reflect: true` MUST go through `resolveChannelStrategy` so the base is `wrapWithReflection` (internal names `reflect:react` / `reflect:plan-and-execute`, `maxReflections` 2). Do not treat `reflect:react` as a channel strategy name

**Checkpoint**: Strategy choice and the reflect flag are independently observable with fakes

---

## Phase 5: User Story 3 - Recusar um envio malformado (Priority: P1)

**Goal**: Corpo inválido responde 400 com `issues` antes de qualquer `run`.

**Independent Test**: Sem `message`, tipo errado, ou JSON ilegível → 400 com `issues` e o substituto não executa. Chaves extras não invalidam.

### Tests for User Story 3

- [X]  [US3] Extend `src/http/server.test.ts` with failing cases: `{}` or a body without `message` → 400 `{ issues }` and an issue whose `path` includes `"message"`; `strategy` as a number, `reflect` as a string, or `message: null` → 400 and `issues` has one entry per failure; non-JSON body → 400 `{ issues: [{ path: [], message: "JSON inválido." }] }`; extra keys still 200 when `message` is a string; `strategy: ""` is NOT 400; none of the 400 cases call `run`

### Implementation for User Story 3

- [X]  [US3] Validate in `src/http/server.ts` with Zod before `runChat`: `z.object({ message: z.string(), strategy: z.string().optional(), reflect: z.boolean().optional() })`, unknown keys stripped (not `.strict()`). On schema failure respond 400 `{ issues: error.issues }` unchanged (each issue keeps at least `path` and `message`). Map the Express JSON parse failure to 400 `{ issues: [{ path: [], message: "JSON inválido." }] }`. Do not call `runChat` on 400

**Checkpoint**: Malformed bodies never execute a strategy

---

## Phase 6: User Story 4 - Recusar estratégia desconhecida (Priority: P1)

**Goal**: Nome fora do catálogo responde 422 citando o texto enviado, mesmo com reflexão pedida, e não executa.

**Independent Test**: `strategy: "reflect:react"` com `reflect: true` → 422 cujo `message` contém `reflect:react`, sem `run` e sem crítico. `""` e `React` também são 422, não 400.

### Tests for User Story 4

- [X]  [US4] Extend `src/http/server.test.ts` with failing cases: `{ message, strategy: "reflect:react", reflect: true }` → 422 `{ message: "Estratégia desconhecida: reflect:react." }` and neither `run` nor the critic is called; `strategy: ""` → 422 citing that empty text; `strategy: "React"` → 422; the body has `message` and not `issues`

### Implementation for User Story 4

- [X]  [US4] In `src/http/server.ts`, catch `UnknownStrategyError` from `runChat` and respond 422 `{ message: error.message }`. Do not put that failure in `issues`. Rely on `resolveChannelStrategy` in `src/agents/index.ts` throwing before `wrapWithReflection` when the name is unknown

**Checkpoint**: 400 and 422 are distinct; unknown names never reach the model

---

## Phase 7: User Story 5 - Encerrar a espera aos três minutos (Priority: P2)

**Goal**: Se `run` não termina dentro do limite, a resposta é 504 e não um 200. O padrão do processo é 180 segundos. O limite cobre a reflexão inteira.

**Independent Test**: Substituta que não resolve e `timeoutMs` curto → 504 sem `answer`, `trace` ou `metrics`. Substituta rápida no mesmo app → 200. `ChatTimeoutError(180000)` usa a frase de 180 segundos.

### Tests for User Story 5

- [X]  [US5] Extend `src/http/server.test.ts` with failing cases: a fake whose `run` never settles, passed via `createApp({ timeoutMs: 30 })`, yields 504 whose `message` states the configured seconds and whose body has no `answer`, `trace`, or `metrics`; a fast fake on that short limit still returns 200; `reflect: true` with a never-settling fake is also 504; `new ChatTimeoutError(180_000).message` equals `Tempo esgotado: a resposta não ficou pronta em 180 segundos.`; the test finishes without waiting 180 seconds

### Implementation for User Story 5

- [X]  [US5] In `src/services/chat-service.ts`, `Promise.race` `strategy.run` against `timeoutMs` from `createApp` (default `180000` in `src/http/server.ts`). On the timer, throw `ChatTimeoutError`. Do not cancel the strategy; attach a catch so a late rejection is not unhandled, and do not return a late success. In `src/http/server.ts`, map `ChatTimeoutError` to 504 `{ message: error.message }`

**Checkpoint**: Timeout is 504; a finished run inside the limit stays 200

---

## Phase 8: User Story 6 - Conferir o canal sem rede (Priority: P2)

**Goal**: O contrato inteiro (200 determinístico, 400, 422, reflexão ligada e desligada) fica provado no teste de integração, sem serviço externo e sem publicar o substituto no catálogo de produção.

**Independent Test**: Duas conferências com o mesmo substituto e a mesma mensagem devolvem o mesmo `answer`. 400 e 422 não chamam `run`. `reflect: true` traz `critique`; `reflect: false` não chama o crítico. O arquivo de teste não importa o modelo.

### Tests for User Story 6

- [X]  [US6] Tighten `src/http/server.test.ts` so the deterministic fake returns the same `answer` on two posts of the same message; 400 and 422 still do not call `run`; `reflect: true` vs `reflect: false` differ by the presence of `critique`; the test file does not import `src/agents/model.ts`, `src/agents/react.ts`, or `src/agents/plan-and-execute.ts`

### Implementation for User Story 6

- [X]  [US6] Close gaps in `src/http/server.ts`, `src/services/chat-service.ts`, and `src/agents/index.ts`: an injected `registry` replaces `channelStrategies` (production map stays only `react` and `plan-and-execute`); an injected `critic` is the one passed to `wrapWithReflection`; do not call `createLlmCritic` / `createModel` on the fake path. `reflect: false` MUST NOT call the critic

**Checkpoint**: FR-014 / SC-006 pass with fakes only

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: O handler bate com o contrato e a suíte fecha o quickstart offline.

- [X]  [P] Align `src/http/server.ts` and `src/services/chat-service.ts` with `specs/003-canal-chat/contracts/chat-http.md` order (invalid JSON → schema → defaults → unknown name → run or timeout) without changing status codes
- [X]  Run `npm run typecheck` and `npm test` until both are green, and confirm `specs/003-canal-chat/quickstart.md` §1 is covered by `src/http/server.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Stories (Phases 3–8)**: Depend on Foundational
  - US1 first (route + `runChat` success path)
  - US2, US3, US4, and US5 edit `src/http/server.ts` and/or `src/services/chat-service.ts` — sequence them; do not edit those files in parallel
  - US6 locks the offline suite after the behaviors it asserts exist
- **Polish (Phase 9)**: After the desired stories

### User Story Dependencies

- **US1 (P1)**: After Foundational — MVP
- **US2 (P1)**: After US1 (`POST /chat` and `runChat` exist)
- **US3 (P1)**: After US1 (validation sits in front of `runChat`). Sequence after US2 to avoid conflicting edits in `src/http/server.ts`
- **US4 (P1)**: After US3 so 422 stays distinct from 400. Uses `UnknownStrategyError` from T004
- **US5 (P2)**: After US1 `run` path. Sequence after US4 because T015 also edits `src/http/server.ts`
- **US6 (P2)**: After US2–US5; no new route, only the offline guarantee

### Within Each User Story

- Tests (included) MUST be written and FAIL before implementation
- `resolveChannelStrategy` (T004) before any story that executes or rejects a name
- `runChat` before the route that returns 200
- Story checkpoint before the next story when working solo

### Parallel Opportunities

- T003 (`src/domain/errors.ts`) and T004 (`src/agents/index.ts`) can run in parallel
- T005–T017 share `src/http/server.test.ts` or the HTTP/service files — **do not** parallelize those writes
- T018 can be a separate pass on the two source files once T017 is done; T019 runs after T018

---

## Parallel Example: Foundational

```bash
Task: "T003 ChatTimeoutError in src/domain/errors.ts"
Task: "T004 resolveChannelStrategy in src/agents/index.ts"
```

## Parallel Example: User Story 1

```bash
# After Foundational, one agent, in order:
Task: "T005 failing POST /chat 200 tests in src/http/server.test.ts"
Task: "T006 runChat success path in src/services/chat-service.ts"
Task: "T007 POST /chat and src/index.ts listen"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: injected `react` fake, two posts, same `answer`, 200
5. Demo `npm run dev` only if the model env is present; the MVP test does not need it

### Incremental Delivery

1. Setup + Foundational → catalog and timeout error exist
2. US1 → 200 with default `react` (MVP)
3. US2 → `strategy` + `reflect`
4. US3 → 400 `issues`
5. US4 → 422 unknown name
6. US5 → 504 at the wait limit
7. US6 → offline contract lock
8. Polish → typecheck, test, quickstart §1

### Parallel Team Strategy

1. Pair completes Setup + Foundational (T003 and T004 in parallel)
2. After that, one owner for `src/http/server.ts`, `src/services/chat-service.ts`, and `src/http/server.test.ts`, in story order US1 → US6
3. Do not split those three files across people during the story phases

---

## Notes

- [P] = different files, no incomplete-task dependencies
- [Story] maps to US1–US6 from `spec.md`
- Constraints quoted in the tasks: `message` string required and may be blank; `strategy` optional string, absent → `react`, empty string → 422 not 400; `reflect` optional boolean, absent → false; unknown keys stripped; catalog keys exactly `react` and `plan-and-execute`; `maxIterations` 8; `maxReflections` 2; `timeoutMs` default 180000; 400 body is `{ issues }`; 422/504 body is `{ message }` and not `{ issues }`
- Commit after each task or logical group
- Stop at checkpoints to validate the story on its own
- Do not add auth, chat history, or a reflection ceiling field on the request
