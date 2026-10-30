# Tasks: War room web

**Input**: Design documents from `/specs/016-war-room-web/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — Independent Tests das US1–US6; constituição princípio V; FR-001–FR-016; contratos em `contracts/`; quickstart.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- API: `src/` with colocated `src/**/*.test.ts`
- War room: `web/` (Vite + React + TS)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de arquivos/pastas; sem mudar comportamento de produção ainda

- [ ] T001 [P] Create `src/http/cors.ts` stub exporting `createCorsMiddleware` that throws `Error("not implemented")`
- [ ] T002 [P] Create `src/agents/approval-gate.ts` stub exporting `TOOLS_REQUIRING_HUMAN_APPROVAL` as empty `ReadonlySet` and `requiresHumanApproval(tool: string): boolean` returning `false`
- [ ] T003 [P] Create `src/store/in-memory-approval-store.ts` stub class `InMemoryApprovalStore` with methods throwing `Error("not implemented")`
- [ ] T004 [P] Create `src/services/approval-service.ts` stub exporting `resolveApproval` that throws `Error("not implemented")`
- [ ] T005 [P] Create placeholder tests `src/http/cors.test.ts`, `src/agents/approval-gate.test.ts`, `src/store/in-memory-approval-store.test.ts` with `node:test` `test.todo` citing `contracts/http-mount-cors.md`, `contracts/approval-gate.md`, `data-model.md`
- [ ] T006 Scaffold `web/` Vite + React + TypeScript (`web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx` placeholder); do not add React deps to root `package.json`
- [ ] T007 [P] Add root script convenience in root `package.json` (e.g. `"web": "npm --prefix web run dev"`) without changing API scripts

**Checkpoint**: Stubs e `web/` existem; API atual ainda sobe; typecheck raiz intacto se stubs não estiverem wired

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos/erros de aprovação, gate set, ApprovalStore, CORS middleware, Router com montagem dual `/` + `/opspilot` — bloqueia todas as stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 [P] Add `ApprovalNotFoundError` (default message exactly `Aprovação não encontrada.`) and `ApprovalAlreadyResolvedError` (default message exactly `Aprovação já resolvida.`) in `src/domain/errors.ts` extending `DomainError`
- [ ] T009 [P] Add domain types in `src/domain/types.ts` per `data-model.md`: `PendingApproval` with fields `id: string`, `createdAt: number`, `status: "pending" | "approved" | "denied"`, `tool` (ToolName), `args: Record<string, unknown>`, `description: string`, `requestId: string`, `conversationId?: string`, `trace`, `metrics`, `resolvedAt?: number`; `ApprovalStore` with `save`, `getById`, `resolve`; `ApprovalDecision` as `"approve" | "deny"`
- [ ] T010 [P] Implement `TOOLS_REQUIRING_HUMAN_APPROVAL` as `ReadonlySet` containing exactly `"open_incident"` and `"resolver_incident"`, and pure `requiresHumanApproval` in `src/agents/approval-gate.ts` per `contracts/approval-gate.md`
- [ ] T011 Replace todos in `src/agents/approval-gate.test.ts`: assert set membership for gated vs read-only tools; run until green
- [ ] T012 Implement `InMemoryApprovalStore` in `src/store/in-memory-approval-store.ts`: Map by id; `save` only `pending`; `getById` → record or `null`; `resolve(id, decision)` transitions `pending` → `approved`|`denied`, sets `resolvedAt`, throws domain errors when missing/already resolved
- [ ] T013 Replace todos in `src/store/in-memory-approval-store.test.ts` with round-trip pending → approve/deny, 404/409 paths; run until green
- [ ] T014 Implement pure CORS helpers + `createCorsMiddleware` in `src/http/cors.ts` per `contracts/http-mount-cors.md`: allowlist from `OPSPILOT_CORS_ORIGINS` (comma-separated) when non-empty; else reflect request `Origin`; set `Vary: Origin`, allow methods `GET, POST, OPTIONS`, headers `Content-Type, X-Request-Id`, expose `X-Request-Id`; handle `OPTIONS` with 204; MUST NOT use `*` as sole policy
- [ ] T015 Replace todos in `src/http/cors.test.ts` with cases: reflect Origin; allowlist deny other origin; OPTIONS 204; run until green
- [ ] T016 Extract existing chat + get-request handlers into a shared Express `Router` (e.g. `src/http/routes.ts` `registerOpsPilotRoutes`) and in `src/http/server.ts` apply CORS middleware then `app.use(router)` and `app.use("/opspilot", router)` so `/chat` and `/opspilot/chat` share semantics per FR-016 / `contracts/http-mount-cors.md`
- [ ] T017 Extend `CreateAppOptions` in `src/http/server.ts` with optional `approvalStore?: ApprovalStore` defaulting to `new InMemoryApprovalStore()`
- [ ] T018 Run `npm run typecheck` and existing `src/http/server.test.ts` until green (legacy `/chat` paths unbroken)

**Checkpoint**: Dual mount + CORS + approval primitives prontos — stories podem wirear 202/UI

---

## Phase 3: User Story 1 - Conversar com o copiloto na war room (Priority: P1) 🎯 MVP

**Goal**: Plantonista envia mensagem na war room e vê a resposta via `POST {base}/opspilot/chat`.

**Independent Test**: API up + war room: enviar texto com URL default → timeline mostra user + assistant; empty state inicial; erro de rede não apaga histórico da sessão.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T019 [P] [US1] In `src/http/server.test.ts`, add failing case: `POST /opspilot/chat` with fake registry returns same 200 shape as `POST /chat` (`answer`, `trace`, `metrics`, `requestId`)
- [ ] T020 [P] [US1] Add `web/src/lib/api.test.ts` (or Vitest colocated) failing case: `buildChatUrl(base)` yields `{base}/opspilot/chat` with trailing slash stripped from base

### Implementation for User Story 1

- [ ] T021 [US1] Implement `web/src/lib/api.ts`: `normalizeApiBase`, `buildChatUrl`, `postChat(message)` calling `POST .../opspilot/chat` and parsing 200 JSON; map network failures to typed error
- [ ] T022 [US1] Implement `web/src/styles/tokens.css` with semantic colors (`bg`, `surface`, `fg`, `muted`, `border`, `danger`, `warning`, `success`) and spacing tokens `space-1`…`space-12` per `.cursor/rules/design.instructions.mdc`; import from `web/src/main.tsx`
- [ ] T023 [US1] Implement `web/src/components/ChatPanel.tsx` + wire in `web/src/App.tsx`: empty state (ícone + título + frase); input + send; append user/assistant; loading; operation error with retry; use default base `http://127.0.0.1:3000` until US4
- [ ] T024 [US1] Run US1 API test + `npm run typecheck`; ensure `web` typechecks (`npm --prefix web run build` or `tsc -b`)

**Checkpoint**: MVP — conversa war room ↔ `/opspilot/chat`

---

## Phase 4: User Story 2 - Ver o raciocínio tipado do turno (Priority: P1)

**Goal**: **Ver raciocínio** abre painel com `TraceEvent[]` tipados do turno; teclado/Escape; empty sem eventos.

**Independent Test**: Turno com `trace` → painel lista `type` + conteúdo; fechar preserva chat; turno sem trace → ação indisponível ou empty específico.

### Tests for User Story 2 ⚠️

- [ ] T025 [P] [US2] Add failing unit test in `web/src/components/TracePanel.test.tsx` (or pure helper test): given sample `TraceEvent[]`, renderer/helper exposes each `type`; empty array → empty-state flag

### Implementation for User Story 2

- [ ] T026 [US2] Add shared TS types for `TraceEvent` union in `web/src/lib/trace.ts` mirroring `src/agents/strategy.ts` discriminators (`thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`, `route`, `fallback`)
- [ ] T027 [US2] Implement `web/src/components/TracePanel.tsx` (drawer/panel): lista tipada; Escape fecha; foco visível; `aria-label` / dialog semantics
- [ ] T028 [US2] Wire **Ver raciocínio** per turn in `web/src/components/ChatPanel.tsx` when `trace.length > 0`; disable or empty copy when length 0
- [ ] T029 [US2] Run US2 web tests + web typecheck

**Checkpoint**: Auditoria de raciocínio sem sair do chat

---

## Phase 5: User Story 3 - Aprovar ou negar quando o chat responde 202 (Priority: P1)

**Goal**: Gate explícito → HTTP 202 + cartão; `POST /opspilot/approvals/:id` resolve; UI não trata 202 como erro.

**Independent Test**: Fake path gated → 202 com `approvalId`; approve executa tool; deny não executa; UI cartão → desfecho; segunda decisão → 409.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T030 [P] [US3] In `src/http/server.test.ts`, add failing case: injected strategy/chat path that would call gated tool returns **202** with `approvalId`, `pending.tool`, `pending.args`, `pending.description`, `requestId`, `trace`, `metrics` per `contracts/chat-http-202.md`; tool side-effect NOT applied yet
- [ ] T031 [P] [US3] In `src/http/server.test.ts`, add failing case: after 202, `POST /opspilot/approvals/:id` `{ "decision": "approve" }` → **200** with `decision: "approve"` and tool side-effect applied; `{ "decision": "deny" }` → **200** without tool side-effect per `contracts/approvals-http.md`
- [ ] T032 [P] [US3] In `src/http/server.test.ts`, add failing cases: unknown approval id → **404**; second resolve → **409**; invalid body → **400** `{ issues }`; empty `:id` → **400**
- [ ] T033 [P] [US3] In strategy/unit test (e.g. `src/agents/react.test.ts` or dedicated `src/agents/approval-gate.integration.test.ts`), failing case: when next tool ∈ gated set, invoke is NOT called and outcome is pending

### Implementation for User Story 3

- [ ] T034 [US3] Extend chat/strategy result discriminator (`ChatOutcome` / `kind: "completed" | "pending_approval"`) in `src/services/chat-service.ts` and strategy types so pending bubbles to HTTP without throwing
- [ ] T035 [US3] In `src/agents/react.ts` and `src/agents/plan-and-execute.ts`, before tool `invoke`, if `requiresHumanApproval(toolName)`: append `action` to trace, `approvalStore.save` pending (`status: "pending"`, `description` non-empty string), return `pending_approval` — do not invoke
- [ ] T036 [US3] In `src/http/server.ts` / routes: on `pending_approval`, persist request best-effort like 200 path, respond **202** JSON per `contracts/chat-http-202.md` (include `X-Request-Id`)
- [ ] T037 [US3] Implement `resolveApproval` in `src/services/approval-service.ts`: load pending; approve → invoke tool via Ops tools/store; deny → no invoke; update store status; return answer/trace/metrics/`decision`
- [ ] T038 [US3] Register `POST /approvals/:id` on shared router with Zod `z.object({ decision: z.enum(["approve", "deny"]) })`; map domain errors to 404/409; success **200** per `contracts/approvals-http.md`
- [ ] T039 [US3] Implement `web/src/components/ApprovalCard.tsx` + `postApproval` in `web/src/lib/api.ts`; on fetch status 202 show card (Approve primary, Deny secondary); block further sends while pending; on 200 clear pending and append answer
- [ ] T040 [US3] Ensure 4xx/5xx paths in `web/src/lib/api.ts` / ChatPanel never render ApprovalCard; run T030–T033 + typecheck until green

**Checkpoint**: HITL 202 ponta a ponta (API + cartão)

---

## Phase 6: User Story 4 - Configurar a URL da API na engrenagem (Priority: P1)

**Goal**: Engrenagem persiste URL base válida em `localStorage`; chat/approvals usam essa base.

**Independent Test**: Alterar URL, salvar, reload → valor permanece; inválida → erro inline sem persistir; requests usam base normalizada + `/opspilot/...`.

### Tests for User Story 4 ⚠️

- [ ] T041 [P] [US4] Failing tests in `web/src/lib/storage.test.ts`: default `http://127.0.0.1:3000`; save valid https URL; reject empty/invalid; strip trailing slash on read/normalize

### Implementation for User Story 4

- [ ] T042 [US4] Implement `web/src/lib/storage.ts` key `opspilot.warRoom.apiBaseUrl` with get/set/validate per `contracts/war-room-ui.md` and `data-model.md` (`apiBaseUrl` absolute http/https)
- [ ] T043 [US4] Implement `web/src/components/SettingsGear.tsx` (icon button `aria-label`, form field, inline errors, save); wire into `web/src/App.tsx`
- [ ] T044 [US4] Plumb stored base through `web/src/lib/api.ts` consumers (ChatPanel, ApprovalCard); run US4 tests + web typecheck

**Checkpoint**: Plantonista aponta a war room para qualquer host local

---

## Phase 7: User Story 5 - API sob `/opspilot` com CORS para a war room (Priority: P1)

**Goal**: Contrato CORS + dual mount verificados de ponta a ponta (complementa Phase 2).

**Independent Test**: Browser origin distinta completa preflight+POST `/opspilot/chat`; allowlist bloqueia origem estranha; raiz e prefixo equivalentes.

### Tests for User Story 5 ⚠️

- [ ] T045 [P] [US5] In `src/http/server.test.ts`, failing/extend cases: request with `Origin: http://localhost:5173` on `POST /opspilot/chat` returns `Access-Control-Allow-Origin` reflecting that origin when allowlist unset; `OPTIONS /opspilot/chat` → 204 with allow methods/headers per `contracts/http-mount-cors.md`
- [ ] T046 [P] [US5] In `src/http/server.test.ts`, case: with `OPSPILOT_CORS_ORIGINS=http://a.example`, Origin `http://b.example` does not receive ACAO for `b`
- [ ] T047 [P] [US5] In `src/http/server.test.ts`, assert `POST /approvals/:id` and `POST /opspilot/approvals/:id` both registered (smoke after US3)

### Implementation for User Story 5

- [ ] T048 [US5] Fix any gaps so CORS middleware in `src/http/server.ts` runs before routes and covers approvals + chat under both mounts; document env `OPSPILOT_CORS_ORIGINS` in `specs/016-war-room-web/quickstart.md` if missing
- [ ] T049 [US5] Run T045–T047 + full `npm test` + `npm run typecheck` until green

**Checkpoint**: War room em outra origem não é bloqueada pelo browser

---

## Phase 8: User Story 6 - Design operacional da war room (Priority: P2)

**Goal**: Hierarquia, empty/error, dark mode, a11y teclado nas jornadas P1.

**Independent Test**: Checklist visual/teclado contra `.cursor/rules/design.instructions.mdc` e SC-006.

### Implementation for User Story 6

- [ ] T050 [P] [US6] Apply typography hierarchy (`display`/`title`/`body`/`caption`) and spacing scale only via tokens in `web/src/styles/tokens.css` + components (`ChatPanel`, `TracePanel`, `ApprovalCard`, `SettingsGear`)
- [ ] T051 [P] [US6] Add dark mode via `prefers-color-scheme` and/or `data-theme` using semantic tokens (no pure `#000`/`#fff` bodies); verify contrast notes in CSS comments or brief `web/README.md`
- [ ] T052 [US6] A11y pass: focus rings, ≥44px targets, `aria-live` for assistant/decision results, modal focus trap if TracePanel is dialog, `prefers-reduced-motion` in `web/src/styles/tokens.css`
- [ ] T053 [US6] Manual design smoke per `quickstart.md` §4; fix gaps in components under `web/src/components/`

**Checkpoint**: Aceite P2 de design

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento transversal

- [ ] T054 [P] Ensure root `.gitignore` ignores `web/node_modules` and `web/dist` if not already
- [ ] T055 Run full validation from `specs/016-war-room-web/quickstart.md` (API tests + war room smoke checklist)
- [ ] T056 Final `npm run typecheck` and `npm test` green at repo root; `npm --prefix web run build` (or project equivalent) green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts immediately
- **Foundational (Phase 2)**: after Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: after Foundational — 🎯 MVP
- **US2 (Phase 4)**: after US1 chat shell (needs turns with trace in UI state)
- **US3 (Phase 5)**: after Foundational; UI card after US1; can parallel API gate work with US2
- **US4 (Phase 6)**: after US1 api helper exists; can parallel US2
- **US5 (Phase 7)**: after Foundational CORS stub wired; harden after US3 routes exist
- **US6 (Phase 8)**: after US1–US4 UI pieces exist
- **Polish (Phase 9)**: after desired stories complete

### User Story Dependencies

- **US1**: Foundational (dual `/opspilot/chat`)
- **US2**: US1 (trace on turns)
- **US3**: Foundational + (UI) US1; API gate independent of US2
- **US4**: US1 api module
- **US5**: Foundational; full coverage after approvals route (US3)
- **US6**: US1–US4 components

### Parallel Opportunities

- T001–T005 stubs in parallel
- T008–T010 domain/gate in parallel
- T030–T033 US3 tests in parallel before impl
- US2 UI (T025–T029) || US3 API (T030–T038) after US1
- T050–T051 design tokens/dark in parallel

---

## Parallel Example: User Story 3

```bash
# Tests first (parallel):
Task: "T030 202 contract in src/http/server.test.ts"
Task: "T031 approvals approve/deny in src/http/server.test.ts"
Task: "T032 404/409/400 in src/http/server.test.ts"
Task: "T033 gate unit in src/agents/…"

# Then sequential wire:
Task: "T034 ChatOutcome discriminator"
Task: "T035 pause-before-invoke in react + plan-and-execute"
Task: "T036 HTTP 202"
Task: "T037-T038 approval-service + route"
Task: "T039-T040 ApprovalCard UI"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational (dual mount + CORS + approval primitives)  
3. Phase 3 US1 war room chat  
4. **STOP and VALIDATE** independent test US1  
5. Demo conversa local  

### Incremental Delivery

1. Setup + Foundational  
2. US1 chat MVP  
3. US4 gear (config real)  
4. US2 Ver raciocínio  
5. US3 202 + approvals + card  
6. US5 CORS hardening  
7. US6 design  
8. Polish / quickstart  

### Parallel Team Strategy

1. Together: Setup + Foundational  
2. Then: Dev A → US1/US4/US2 UI; Dev B → US3 API gate/approvals; Dev C → US5 CORS tests + US6 polish  

---

## Notes

- [P] = different files, no incomplete-task deps
- Constitution V: tests included even though template marks them optional
- War room only calls `/opspilot/*`; dual mount keeps legacy `/chat` green
- Approvals MVP in-memory — restart clears pendencies (documented in data-model)
- Commit after each task or logical group; keep `typecheck`/`test` green
