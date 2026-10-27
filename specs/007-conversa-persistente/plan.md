# Implementation Plan: Conversa persistente

**Branch**: `007-conversa-persistente` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-conversa-persistente/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

O `/chat` passa a continuar um fio. `conversationId` é opcional no pedido e volta no 200. Um `SqliteConversationStore` separado (`create` / `append` / `lastMessages`) grava as tabelas `conversations` e `messages` no mesmo arquivo do guarda operacional (`OPSPILOT_DB`, default `./data/opspilot.db`; `:memory:` nos testes). A composição do turno, antes da estratégia, monta um único texto com no máximo as 12 mensagens mais recentes (pedido atual incluído) e informa `metrics.historyMessages`. A gravação do par pedido+`answer` só ocorre depois que o turno vence a espera. Arena e bench não mudam.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Express, Zod, `node:sqlite` (`DatabaseSync`), estratégias já existentes (`react`, `plan-and-execute`, reflexão). Sem dependência nova.

**Storage**: SQLite no mesmo caminho de `SqliteOpsStore`. Conexão própria do `SqliteConversationStore`. Testes em `:memory:`.

**Testing**: `node:test` via `tsx`. Store, função pura da janela e `POST /chat` com estratégia substituta, sem rede.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente + borda HTTP já existente

**Performance Goals**: A janela é uma leitura indexada de no máximo 12 linhas; não acrescenta espera além dos 180s já definidos para o turno.

**Constraints**: Persistir só no 200 de turno executado; 400 → 422 → 404 antes de executar; pedido vazio não grava e não chama estratégia; estratégias não leem o histórico; stdout/arena/bench fora desta feature; código não lê `.env`.

**Scale/Scope**: Um processo, um arquivo, sem listagem nem retenção. Cerca de 8 arquivos tocados (store, prompt puro, service, HTTP e testes).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP em `src/http/server.ts` só valida e traduz erro. `runChat` orquestra. `SqliteConversationStore` é o model. O handler não consulta SQL. |
| II | **Funções puras** | ✅ PASS | Janela e texto do prompt são funções puras em `src/services/history-prompt.ts`. I/O fica no store e na estratégia. |
| III | **Validações na fronteira** | ✅ PASS | Zod no corpo, inclusive `conversationId` texto não vazio. Falante e texto vazio são recusados no store antes do `INSERT`. |
| IV | **Erros de domínio** | ✅ PASS | `ConversationNotFoundError` → 404. `InvalidConversationMessageError` no store. 422 e 504 já existentes permanecem. |
| V | **Teste é parte da tarefa** | ✅ PASS | FR-018: store `:memory:`, prompt puro e canal com substituto sem rede. |
| VI | **Segurança por padrão** | ✅ PASS | Sem segredo novo. Identificador opaco (`randomUUID`). Quem o conhece continua o fio, como a spec assume. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | A implementação cabe em fatias: store, prompt puro, service, HTTP. Este plano não as mistura num único commit de código. |

**Stack**: ✅ Node 22, Zod, Express, `node:sqlite` / `DatabaseSync`, sem ORM. Mesmo `OPSPILOT_DB` da constituição.

**Gate result: ALL PASS** — Complexity Tracking não necessário.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/conversation-store.md](./contracts/conversation-store.md) e [contracts/chat-http.md](./contracts/chat-http.md) mantêm a borda HTTP, o store atrás do service e a composição pura antes da estratégia. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/007-conversa-persistente/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── conversation-store.md
│   └── chat-http.md
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── types.ts                         # ← ConversationRole, ConversationMessage, ConversationStore
│   └── errors.ts                        # ← ConversationNotFoundError, InvalidConversationMessageError
├── store/
│   ├── sqlite-conversation-store.ts     # ← NOVO
│   └── sqlite-conversation-store.test.ts
├── services/
│   ├── history-prompt.ts                # ← NOVO: selectHistoryWindow + renderHistoryPrompt
│   ├── history-prompt.test.ts
│   └── chat-service.ts                  # ← janela, historyMessages, gravar só no 200
├── http/
│   ├── server.ts                        # ← conversationId, 404, store injetável
│   └── server.test.ts                   # ← :memory:; texto composto; janela; 404
```

Fora desta feature: `src/arena.ts`, `src/bench.ts`, `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, `src/mcp/`. Eles seguem recebendo uma string e não abrem conversa.

**Structure Decision**: Projeto único. O guarda de conversa espelha `SqliteOpsStore` (construtor com path, DDL idempotente, prepared statements, `:memory:`), mas não entra na interface `OpsStore` — bench e arena continuam no store operacional em memória. A composição mora no service do canal, não dentro de cada estratégia. `createApp` recebe `conversationStore` opcional e, em produção, instancia `new SqliteConversationStore()` (o construtor já lê `OPSPILOT_DB`).

## Complexity Tracking

> Nenhuma violação — seção vazia de propósito.
