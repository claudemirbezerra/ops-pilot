# Implementation Plan: Sumarização de histórico (pruning)

**Branch**: `011-sumarizacao-historico` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-sumarizacao-historico/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Pruning de histórico no `/chat`: janela bruta **8** mensagens + resumo persistido em `conversation_summaries`. Consolidação só quando **8** mensagens novas saem da janela (`covered_through_id`); merge com resumo anterior via porta `ConversationSummarizer` (~150 tokens, decisões/fatos/pendências); evento `summarize` no `trace`; resumo no contexto (entre memória e histórico); testes com fake + `:memory:`. Soft-fail se o sumarizador falhar.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Express, Zod, LangChain/`ChatOpenAI` (sumarizador LLM default). Sem dependência npm nova.

**Storage**: SQLite via `node:sqlite` (`DatabaseSync`); tabela nova `conversation_summaries` no `SqliteConversationStore` (`OPSPILOT_DB` / `:memory:`)

**Testing**: `node:test` via `tsx`. Store `:memory:`; `ConversationSummarizer` fake contável; `createApp` + estratégia eco; asserts de janela 8, gatilho, `trace`, `contextBreakdown.summary`

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente + borda HTTP já existente

**Performance Goals**: Sumarização no máximo a cada 8 egressos (não por request). Uma chamada LLM extra só nesse turno. Timeout `/chat` permanece 180s (sumarização await no caminho de sucesso após a estratégia).

**Constraints**: Soft-fail do sumarizador (não corrompe resumo; 200 da estratégia). Arena/bench fora. Request `/chat` sem campos novos. Código não lê `.env`.

**Scale/Scope**: Um processo. Touches: `history-prompt` (limit 8 + render summary), `sqlite-conversation-store` (+DDL/API), `ConversationSummarizer`, `chat-service` (composição + gatilho), `TraceEvent`, `contextBreakdown.summary`, testes store/HTTP/prompt.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP só serializa `trace`/`metrics`. Orquestração e gatilho em `chat-service`. Persistência no store. Sumarizador como porta (agents/services), sem SQL no controller. |
| II | **Funções puras** | ✅ PASS | `selectHistoryWindow`, `renderHistoryPrompt`, `renderSummaryPrompt`, montagem de breakdown — puras. I/O no store e no summarizer. |
| III | **Validações na fronteira** | ✅ PASS | Body `/chat` inalterado (Zod). Saídas novas só em `trace` / `contextBreakdown`. |
| IV | **Erros de domínio** | ✅ PASS | Reutiliza `ConversationNotFoundError` / rejeição de resumo vazio no store. Falha do LLM → soft-fail, não novo 5xx de domínio obrigatório. |
| V | **Teste é parte da tarefa** | ✅ PASS | Testes store, janela, fake summarizer, HTTP (evento + breakdown + prompt). |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo. Prepared statements. Resumo não introduz ação destrutiva. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: limit 8 → DDL/API resumo → porta summarizer → wire runChat → TraceEvent/breakdown → testes. |

**Stack**: ✅ Node 22, Zod, Express, `node:sqlite`, LangChain/OpenRouter. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/conversation-store.md](./contracts/conversation-store.md), [contracts/summarizer.md](./contracts/summarizer.md), [contracts/chat-http.md](./contracts/chat-http.md) mantêm borda HTTP magra, store com cursor, sumarizador injetável e soft-fail. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/011-sumarizacao-historico/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── conversation-store.md
│   ├── summarizer.md
│   └── chat-http.md
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── types.ts                    # ← ConversationStore estendido (getSummary, upsertSummary, listUnsummarized…)
├── store/
│   ├── sqlite-conversation-store.ts    # ← DDL conversation_summaries + métodos
│   └── sqlite-conversation-store.test.ts
├── services/
│   ├── history-prompt.ts           # ← HISTORY_LIMIT=8; renderSummaryPrompt
│   ├── history-prompt.test.ts
│   ├── chat-service.ts             # ← composição + gatilho pós-append + soft-fail
│   └── chat-service.test.ts        # ← se existir / casos de consolidação
├── agents/
│   ├── strategy.ts                 # ← TraceEvent "summarize"
│   ├── conversation-summarizer.ts  # ← NOVO: tipo + createLlmConversationSummarizer
│   └── conversation-summarizer.test.ts  # ← NOVO (fake / contrato leve)
├── context/
│   └── tokens.ts                   # ← reutilizado (estimateTokens no breakdown.summary)
├── http/
│   ├── server.ts                   # ← CreateAppOptions.conversationSummarizer
│   └── server.test.ts              # ← janela 8, summarize, breakdown.summary, fake
```

**Structure Decision**: Projeto único. Persistência no `SqliteConversationStore` existente. Porta do sumarizador espelha `LearningExtractor`. Composição e gatilho só em `chat-service` / `history-prompt` (funções puras onde couber).

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
