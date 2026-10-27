# Tasks: Conversa persistente

**Input**: Design documents from `/specs/007-conversa-persistente/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-018 e US4 exigem conferência em `:memory:` sem rede (store, janela pura e `POST /chat`); constituição princípio V.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, tests colocated as `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueletos do guarda e da composição, sem dependência nova (plan.md)

- [X] T001 [P] Create `src/store/sqlite-conversation-store.ts` exporting `class SqliteConversationStore` with `constructor(path?: string)` defaulting to `process.env.OPSPILOT_DB ?? "./data/opspilot.db"` (methods may throw `Error("not implemented")`)
- [X] T002 [P] Create `src/services/history-prompt.ts` exporting `HISTORY_LIMIT = 12` and stub `selectHistoryWindow` / `renderHistoryPrompt` (may throw `Error("not implemented")`)
- [X] T003 [P] Create `src/store/sqlite-conversation-store.test.ts` and `src/services/history-prompt.test.ts` importing `node:test` and `node:assert/strict`, with no cases yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos e erros de domínio que US1–US4 usam. Nenhum SQL e nenhuma rota nesta fase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Add to `src/domain/types.ts` per `data-model.md` / `contracts/conversation-store.md`: `ConversationRole = "user" | "assistant"`; `ConversationMessage = { role: ConversationRole; content: string }`; `ConversationStore` with `create(): string`, `append(conversationId: string, message: ConversationMessage): void`, `lastMessages(conversationId: string, limit: number): ConversationMessage[]`
- [X] T005 [P] Add `ConversationNotFoundError` and `InvalidConversationMessageError` extending `DomainError` in `src/domain/errors.ts` (404 copy is fixed later: `Conversa desconhecida: <id>.`)
- [X] T006 Run `npm run typecheck` and confirm `src/domain/types.ts` and `src/domain/errors.ts` compile under `strict: true`

**Checkpoint**: Foundation ready — store, prompt e canal podem começar

---

## Phase 3: User Story 1 - Continuar o mesmo plantão (Priority: P1) 🎯 MVP

**Goal**: `conversationId` opcional volta no 200; o par pedido cru + `answer` fica no mesmo fio; conversas distintas não se misturam.

**Independent Test**: `SqliteConversationStore(":memory:")` cria fio vazio, grava e relê em ordem. Dois `POST /chat` sem id abrem fios diferentes; o segundo POST com o id devolvido acrescenta no mesmo fio. A estratégia ainda recebe a mensagem crua (a janela é US2).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [P] [US1] Write store cases in `src/store/sqlite-conversation-store.test.ts` using only `new SqliteConversationStore(":memory:")` (no temp file): `create()` returns a non-empty string and `lastMessages(id, 12)` is `[]`; two `create()` ids differ; `append` user then assistant then `lastMessages` returns that order with content unchanged (no trim); `lastMessages(id, 2)` with 4 rows returns only the 2 newest, oldest-first; two conversations do not leak; missing id on `append` and `lastMessages` throws `ConversationNotFoundError` and inserts nothing; `content` `""` or `"   "` and `role` other than `"user"` | `"assistant"` throw `InvalidConversationMessageError` and insert nothing; `limit` that is not an integer `>= 1` throws `InvalidConversationMessageError`; direct `database.prepare` INSERT with `role` outside `CHECK (role IN ('user', 'assistant'))` throws
- [X] T008 [P] [US1] Write channel cases in `src/http/server.test.ts`: every `createApp` in this file receives `conversationStore: new SqliteConversationStore(":memory:")`; POST `{ message }` without `conversationId` returns 200 with a non-empty string `conversationId` and the fake still receives the raw message; a second POST with that id returns the same `conversationId`; after two successful turns the store has four messages in order user/assistant/user/assistant using the raw message and the `answer` (not the trace); two POSTs without id return different ids; `conversationId` as number, `null`, `""` or `"   "` returns 400 with `issues` and does not call the fake

### Implementation for User Story 1

- [X] T009 [P] [US1] Implement `SqliteConversationStore` in `src/store/sqlite-conversation-store.ts`: `mkdirSync` parent when path is not `:memory:`; `PRAGMA foreign_keys = ON`; `PRAGMA busy_timeout = 5000`; idempotent DDL for `conversations` (`id TEXT PRIMARY KEY`, `created_at INTEGER NOT NULL`) and `messages` (`id INTEGER PRIMARY KEY AUTOINCREMENT`, `conversation_id TEXT NOT NULL REFERENCES conversations(id)`, `role TEXT NOT NULL CHECK (role IN ('user', 'assistant'))`, `content TEXT NOT NULL`, `created_at INTEGER NOT NULL`) plus index `messages_conversation_id_id (conversation_id, id)`; prepared statements only; `create()` inserts `crypto.randomUUID()` and `Date.now()`; `append` / `lastMessages` throw `ConversationNotFoundError` (`Conversa desconhecida: <id>.`) when the conversation row is missing; reject blank content and bad role with `InvalidConversationMessageError` before INSERT; `lastMessages` uses `ORDER BY id DESC LIMIT ?` then reverses to chronological and returns only `{ role, content }`; expose `readonly database` like `SqliteOpsStore`. Do not touch `services`, `alerts`, `incidents` or `runbooks`
- [X] T010 [P] [US1] Extend `runChat` in `src/services/chat-service.ts` to accept `conversationId?: string` and `conversationStore: ConversationStore`. On the success path of the existing timeout race only: `create()` when `conversationId` is omitted, then `append` `{ role: "user", content: message }` (raw text) and `append` `{ role: "assistant", content: answer }`. Return `conversationId` on the chat result. Still pass `input.message` unchanged to `strategy.run` (no history prompt yet, no `historyMessages` yet). Do not append on `ChatTimeoutError`
- [X] T011 [US1] In `src/http/server.ts`, add optional `conversationId` to the Zod body as `z.string().trim().min(1).optional()`; add `conversationStore?: ConversationStore` to `CreateAppOptions` defaulting to `new SqliteConversationStore()`; pass both into `runChat`; include `conversationId` on the 200 JSON. Leave 400/422/504 bodies unchanged
- [X] T012 [US1] Run `npm test` for `src/store/sqlite-conversation-store.test.ts` and `src/http/server.test.ts`, plus `npm run typecheck`, until the US1 cases and the existing channel tests are green

**Checkpoint**: MVP — o plantonista recebe um id, continua o mesmo fio e o par pedido/`answer` sobrevive no SQLite em memória

---

## Phase 4: User Story 2 - Lembrar só a janela recente (Priority: P1)

**Goal**: O texto da estratégia traz no máximo as 12 mensagens mais recentes, com falante distinguível, e `metrics.historyMessages` iguala essa quantidade, uma vez por turno.

**Independent Test**: Função pura cobre 0, 2 e 12 mensagens prévias. No canal, o primeiro turno manda `Plantonista: <pedido>` e `historyMessages` 1; o segundo, no mesmo id, manda o turno anterior mais o pedido novo e `historyMessages` 3; com 12 já gravadas, o prompt tem 12 e a mais antiga fica só no store.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T013 [P] [US2] Test `selectHistoryWindow` / `renderHistoryPrompt` in `src/services/history-prompt.test.ts`: zero prior messages → one `user` line and render `Plantonista: <text>`; two prior (`user`, `assistant`) plus current → 3 lines, labels `Plantonista` / `Copiloto`, joined by `\n` in chronological order; 12 prior plus current → length 12, the oldest prior is dropped, `HISTORY_LIMIT` is 12
- [X] T014 [P] [US2] Add channel cases in `src/http/server.test.ts` on a dedicated `createApp` + `SqliteConversationStore(":memory:")`: first 200 has `metrics.historyMessages === 1` and the fake `run` message is exactly `Plantonista: <raw message>`; second POST with the returned id has `historyMessages === 3` and the fake message contains the first raw message, the first `answer` as `Copiloto:`, and the new message as the last `Plantonista:` line; seed 12 messages with `append` then POST → fake message has 12 lines, `historyMessages === 12`, and the oldest seeded content is absent from the fake message but still returned by `lastMessages`; `reflect: true` on a new conversation keeps `historyMessages === 1` (not multiplied) and still calls the critic once; `metrics.llmCalls` and `metrics.latencyMs` remain present

### Implementation for User Story 2

- [X] T015 [US2] Implement pure helpers in `src/services/history-prompt.ts`: `selectHistoryWindow(prior, currentText)` appends `{ role: "user", content: currentText }` and `slice(-HISTORY_LIMIT)`; `renderHistoryPrompt` maps `user` → `Plantonista` and `assistant` → `Copiloto` as `` `${label}: ${content}` `` joined by `\n`. No I/O
- [X] T016 [US2] In `src/services/chat-service.ts`, before `strategy.run`, load `lastMessages(id, HISTORY_LIMIT)` when `conversationId` is present (else `[]`), build the window and pass `renderHistoryPrompt(window)` as the strategy input. Set chat `metrics.historyMessages` to `window.length` once per turn. Do not add `historyMessages` to `StrategyResult` / `runWithMetrics` / reflection. Keep persisting the raw user text and the `answer`, not the composed prompt
- [X] T017 [US2] Update existing echo assertions in `src/http/server.test.ts` that expect the raw message (`react:listar alertas`, `plan-and-execute:abrir incidente`, `react:com extra`, `react:rapido`) to expect the `Plantonista: ` prefix. Two identical POSTs without id must still return the same `answer`
- [X] T018 [US2] Run `npm test` for `src/services/history-prompt.test.ts` and `src/http/server.test.ts` until the US2 cases and the updated channel assertions are green

**Checkpoint**: ReAct, Plan-and-Execute e a reflexão recebem a mesma janela; `historyMessages` conta uma vez

---

## Phase 5: User Story 3 - Recusar fio inexistente sem gravar (Priority: P1)

**Goal**: 404 para id desconhecido; 400/422/504 e pedido vazio não gravam e não criam conversa. A ordem é 400, depois 422, depois 404, e só então a execução.

**Independent Test**: Id ausente no store → 404, fake não roda, contagem de linhas igual. Estratégia desconhecida com id ausente → 422. Mensagem em branco não chama o fake. Timeout 504 não aumenta `conversations` nem `messages`.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [US3] Add cases in `src/http/server.test.ts` with a dedicated `:memory:` store: unknown `conversationId` text returns 404 `{ message: "Conversa desconhecida: <id>." }` with no `answer` / `trace` / `metrics` / `conversationId`, fake call count unchanged, and `SELECT COUNT(*)` on `conversations` and `messages` unchanged; unknown strategy plus unknown id returns 422 (not 404) and does not call the fake; message `"   "` with a known strategy returns the existing empty-input 200, `metrics.historyMessages === 0`, fake not called, no new rows, omits `conversationId` when the field was absent, echoes it when it exists, and returns 404 when it does not exist; blank message plus unknown strategy is still 422; short timeout (same 30ms never-settling fake already in this file) returns 504 without `conversationId` and does not increase conversation or message counts

### Implementation for User Story 3

- [X] T020 [US3] In `src/services/chat-service.ts` enforce this order: resolve strategy first (unknown name throws `UnknownStrategyError` before any store read); if `conversationId` is present, `lastMessages(id, HISTORY_LIMIT)` so a missing id throws `ConversationNotFoundError` before `strategy.run`; if `isBlankInput(message)`, return `buildEmptyInputResult()` plus `historyMessages: 0` and the existing id when it was valid, without `strategy.run`, `create` or `append`; compose and run only after that; persist only when the timeout race returns a result. In `src/http/server.ts` map `ConversationNotFoundError` to 404 `{ message: error.message }` and do not attach `conversationId` on 400/422/504
- [X] T021 [US3] Run `npm test` for `src/http/server.test.ts` until the US3 cases are green

**Checkpoint**: Falha de corpo, de estratégia, de id ou de tempo deixa o store como estava

---

## Phase 6: User Story 4 - Conferir histórico sem arquivo e sem rede (Priority: P2)

**Goal**: A suíte que prova o guarda e o canal usa só `:memory:` e substituto. Arena, bench e as estratégias não passam a conhecer conversa.

**Independent Test**: `npm test` e `npm run typecheck` verdes; `src/arena.ts`, `src/bench.ts`, `src/agents/react.ts` e `src/agents/plan-and-execute.ts` não referenciam o guarda de conversa nem o prompt de histórico.

### Tests for User Story 4 ⚠️

- [X] T022 [P] [US4] Add `src/store/conversation-scope.test.ts` that reads `src/arena.ts`, `src/bench.ts`, `src/agents/react.ts` and `src/agents/plan-and-execute.ts` and asserts none contain `SqliteConversationStore`, `ConversationStore`, `history-prompt` or `HISTORY_LIMIT` (FR-019). Do not weaken `src/store/bench-uses-in-memory.test.ts`

### Implementation for User Story 4

- [X] T023 [US4] Run `npm test` and `npm run typecheck` until the full suite is green, including store, prompt, channel and `src/store/conversation-scope.test.ts`, with no network and no new `package.json` dependency

**Checkpoint**: Regressão do fio contínuo cabe em `:memory:` e não arrasta arena/bench

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Smoke do quickstart e higiene do que ficou de fora

- [X] T024 Run quickstart `specs/007-conversa-persistente/quickstart.md` §2 manually: `POST /chat` without `conversationId`, restart the process on the same `OPSPILOT_DB` (or default `./data/opspilot.db`), POST again with that id, expect the same id and `historyMessages` 3; an invented id returns 404. Do not load `.env` from application code
- [X] T025 [P] Confirm `package.json` has no new dependency and that `src/mcp/` was not modified for this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: start immediately
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: depends on Foundational — MVP, no dependency on US2–US4
- **User Story 2 (Phase 4)**: pure helpers can be written after Foundational; wiring `src/services/chat-service.ts` depends on US1's `runChat` persist path
- **User Story 3 (Phase 5)**: depends on US1 (store + HTTP) and US2 (`historyMessages` on the blank 200)
- **User Story 4 (Phase 6)**: depends on US1–US3 so the full suite is the thing being proved
- **Polish (Phase 7)**: depends on US4

### User Story Dependencies

- **User Story 1 (P1)**: after Foundational only
- **User Story 2 (P1)**: integrates with US1; the pure window does not need the HTTP channel
- **User Story 3 (P1)**: after US1 and US2
- **User Story 4 (P2)**: after US3

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Store before the channel wiring that calls it
- `history-prompt.ts` before `runChat` composition
- Story green before the next priority

### Parallel Opportunities

- T001, T002 and T003 touch different files
- T004 and T005 touch different files
- T007 and T008 are different test files
- T009 and T010 are different production files (interface already exists)
- T013 and T014 are different test files
- T022 can be written as soon as Foundational exists; it stays red-free even before the channel, and is rechecked in T023

---

## Parallel Example: User Story 1

```bash
# Tests together, before implementation:
Task: "Store cases in src/store/sqlite-conversation-store.test.ts"
Task: "Channel id cases in src/http/server.test.ts"

# Then production files that do not import each other:
Task: "Implement SqliteConversationStore in src/store/sqlite-conversation-store.ts"
Task: "Persist the turn in src/services/chat-service.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Window tests in src/services/history-prompt.test.ts"
Task: "historyMessages cases in src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `:memory:` store + two POSTs sharing `conversationId`
5. Demo the id before adding the 12-message window

### Incremental Delivery

1. Setup + Foundational → types and errors compile
2. US1 → fio persistido (MVP)
3. US2 → janela de 12 e `historyMessages`
4. US3 → 404 / pedido vazio / 504 sem gravar
5. US4 + Polish → suíte inteira e smoke de reinício

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational:
   - Dev A: US1 store (`src/store/sqlite-conversation-store.ts`)
   - Dev B: US2 pure prompt (`src/services/history-prompt.ts`) and its tests
3. After US1: wire the prompt into `runChat`, then US3, then US4

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Tests stay on `:memory:`. File reopen is only the manual quickstart (T024)
- Do not change `StrategyResult.metrics` (`llmCalls`, `latencyMs` only). `historyMessages` lives on the chat result
- Do not modify `src/arena.ts`, `src/bench.ts`, `src/agents/react.ts`, `src/agents/plan-and-execute.ts` or `src/mcp/`
- Commit after each task or logical group (princípio VIII)
- Stop at any checkpoint to validate the story independently
