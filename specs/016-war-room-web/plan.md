# Implementation Plan: War room web

**Branch**: `016-war-room-web` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-war-room-web/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

War room em `web/` (Vite + React + TS) conversa com o OpsPilot via **`/opspilot/chat`**, mostra **Ver raciocínio** (trace tipado do corpo), trata **HTTP 202** como cartão aprovar/negar, e configura a URL da API na engrenagem (`localStorage`). No backend: montagem dual (`/` + `/opspilot`), CORS (Origin refletida ou allowlist `OPSPILOT_CORS_ORIGINS`), gate explícito em tools mutantes (`open_incident`, `resolver_incident`) pausando antes do invoke, `ApprovalStore` in-memory e **`POST /opspilot/approvals/:id`** com `{ decision: approve | deny }`.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true` (API); TypeScript + React 19 (ou estável atual) no app `web/` via Vite.

**Primary Dependencies**:
- API (já no repo): Express, Zod, LangChain/LangGraph, `node:sqlite` (inalterado para approvals MVP).
- Web (novo em `web/package.json`): `vite`, `react`, `react-dom`, tipagens. Sem UI kit pesado — CSS tokens alinhados a `design.instructions.mdc`.

**Storage**: Approvals MVP em memória do processo (`InMemoryApprovalStore`). URL da API no `localStorage` do browser. SQLite operacional inalterado (requests/trace 015 opcional para a UI).

**Testing**: API — `node:test` via tsx (`createApp`, CORS, dual mount, 202, approvals). Web — testes leves com o runner do Vite/React se adotado na implementação; no mínimo typecheck do `web/`. Root: `npm run typecheck` + `npm test` verdes.

**Target Platform**: API `127.0.0.1` (`npm run dev`); war room Vite dev server (origem distinta → CORS).

**Project Type**: Agente HTTP existente + SPA de plantão em `web/`.

**Performance Goals**: Chat e approvals síncronos no processo (mesmo perfil de plantão). UI: feedback imediato de loading/erro; sem meta de fps.

**Constraints**: Não ler `.env` no código de aplicação além do padrão atual de `process.env.*` já usado; não commitir secrets. War room só paths `/opspilot/*`. Uma pendência 202 ativa por conversa na UI. Gate só em tools marcadas. Camadas API: HTTP → service/store; store sem Express.

**Scale/Scope**: Um plantonista local; um processo API. Touches: `src/http/*`, gate em strategies/tools, `ApprovalStore`, erros de domínio, pasta `web/**`, design rule já existente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | Rotas HTTP só orquestram; `runChat`/approval service; store de aprovação sem Express; tools/strategies não conhecem HTTP. |
| II | **Funções puras** | ✅ PASS | Allowlist CORS, join de URL `/opspilot`, set de tools gated, parse de decisão — helpers puros testáveis. |
| III | **Validações na fronteira** | ✅ PASS | Body `/chat` Zod; body `/approvals/:id` Zod (`decision`); param `:id` na borda. |
| IV | **Erros de domínio** | ✅ PASS | `ApprovalNotFoundError` → 404; `ApprovalAlreadyResolvedError` → 409; demais erros de chat inalterados. |
| V | **Teste é parte da tarefa** | ✅ PASS | Dual mount, CORS, 202+approve/deny, gate sem tool marked → 200; typecheck/test verdes. |
| VI | **Segurança por padrão** | ✅ PASS | Mutações gated; CORS sem `*` único; sem auth (escopo MVP documentado); sem secrets no `web/`. |
| VII | **Spec antes de código** | ✅ PASS | specify → clarify → plan (esta fase). |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: mount+CORS → gate+202 → approvals → web scaffold → UI fluxos. |

**Stack**: ✅ Backend permanece Node 22 / TS ESM / Zod / Express / SQLite / LangGraph. **UI** Vite+React em `web/` é superfície adicional mandada pela spec (não substitui a stack do agente). Sem ORM novo; approvals in-memory no MVP.

**Gate result: ALL PASS** — Complexity Tracking registra só a adição explícita do frontend (não é violação de princípio).

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) e [research.md](./research.md) preservam camadas, Zod, erros de domínio, dual mount e gate explícito. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/016-war-room-web/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-mount-cors.md
│   ├── chat-http-202.md
│   ├── approvals-http.md
│   ├── approval-gate.md
│   └── war-room-ui.md
└── tasks.md                 # /speckit-tasks — NÃO gerado aqui
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── errors.ts                 # ← ApprovalNotFoundError, ApprovalAlreadyResolvedError
│   └── types.ts                  # ← ApprovalStore, PendingApproval, ChatOutcome
├── services/
│   ├── chat-service.ts           # ← discriminar completed | pending_approval
│   └── approval-service.ts       # NOVO: resolve approve/deny + invoke tool
├── store/
│   └── in-memory-approval-store.ts  # NOVO
├── agents/
│   ├── strategy.ts               # ← tipos TraceEvent (UI); talvez pending no result
│   ├── tools.ts / approval-gate.ts  # NOVO: TOOLS_REQUIRING_HUMAN_APPROVAL + helper
│   ├── react.ts                  # ← pause before gated invoke
│   └── plan-and-execute.ts       # ← idem
└── http/
    ├── server.ts                 # ← CORS, dual mount, approvals route
    ├── routes.ts                 # NOVO (opcional): registerOpsPilotRoutes
    ├── cors.ts                   # NOVO: middleware puro/config
    └── server.test.ts            # ← CORS, /opspilot/*, 202, approvals

web/                              # NOVO — Vite + React + TS
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/tokens.css         # design tokens (space-*, semantic colors)
│   ├── lib/api.ts                # base URL + /opspilot/chat + approvals
│   ├── lib/storage.ts            # localStorage API URL
│   └── components/
│       ├── ChatPanel.tsx
│       ├── TracePanel.tsx        # Ver raciocínio
│       ├── ApprovalCard.tsx      # 202
│       └── SettingsGear.tsx
└── …
```

**Structure Decision**: Monorepo leve — backend em `src/` (padrão atual); SPA isolada em `web/`. Rotas HTTP compartilhadas montadas duas vezes. Approvals não misturam em `OpsStore` / `RequestStore`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| App React/Vite fora da “stack obrigatória” do agente | Spec manda war room web em `web/` com Vite+React+TS | Servir HTML estático sem React falha o mandato e o design system operacional |
