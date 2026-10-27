# Implementation Plan: Memória semântica

**Branch**: `008-memoria-semantica` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-memoria-semantica/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

MemoryStore por `userId` (*remember* com dedup se similaridade **> 0,92**, *recall* top-3 com mínimo **0,3**, *forget*), tabela `memories` no mesmo SQLite do OpsPilot, embeddings locais **all-MiniLM-L6-v2** (`@huggingface/transformers`, mean + normalize, lazy singleton). O `/chat` ganha `userId` opcional e injeta o recall no prompt antes da janela de conversa. Teste obrigatório: recall encontra fato sem palavra em comum. Arena/bench inalterados; sem *remember* automático no canal.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Express, Zod, `node:sqlite` (`DatabaseSync`), stack LangChain já existente; **nova**: `@huggingface/transformers` (modelo `Xenova/all-MiniLM-L6-v2`)

**Storage**: SQLite no mesmo caminho de ops/conversa (`OPSPILOT_DB`, default `./data/opspilot.db`). Tabela `memories` (BLOB de Float32). Testes em `:memory:`.

**Testing**: `node:test` via `tsx`. Funções puras de similaridade; store com embedder fake; um ensaio com modelo real; `POST /chat` com estratégia substituta sem LLM de chat.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente + borda HTTP já existente

**Performance Goals**: Scoring linear por fatos do `userId` (escala de plantão). Primeiro embed pode baixar o modelo; demais reusam o singleton. Timeout do `/chat` permanece 180s.

**Constraints**: Dedup **> 0,92**; recall **≥ 0,3**, top **3**; produto interno de vetores unitários; sem *remember* automático no `/chat`; arena/bench fora; código não lê `.env` para lógica; embedding local.

**Scale/Scope**: Um processo, um arquivo SQLite. Módulos novos sob `src/memory/`; toque em `chat-service`, `http/server`, `domain/*` e testes. Sem CRUD HTTP de memória nesta feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP valida `userId` e traduz erros. `runChat` orquestra recall + composição. `SqliteMemoryStore` / embeddings são model/infra. Handler não faz SQL nem chama o pipeline direto. |
| II | **Funções puras** | ✅ PASS | `dot`, ranking/dedup e `renderMemoryPrompt` são puros. I/O fica no store e no embedder. |
| III | **Validações na fronteira** | ✅ PASS | Zod: `userId` opcional trim min 1. Store rejeita textos em branco antes de embed/SQL. |
| IV | **Erros de domínio** | ✅ PASS | `InvalidMemoryInputError`, `MemoryNotFoundError`, `EmbeddingUnavailableError` + erros de conversa/estratégia já existentes. |
| V | **Teste é parte da tarefa** | ✅ PASS | FR-013 / SC-003: ensaio semântico; demais casos com fake embedder e `:memory:`. |
| VI | **Segurança por padrão** | ✅ PASS | Sem segredo novo. `userId` é escopo opaco (assumido na spec). SQL parametrizado. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: deps+embeddings, store, prompt puro, chat/HTTP, ensaio semântico. |

**Stack**: ✅ Node 22, Zod, Express, `node:sqlite`. Dependência nova justificada pela spec (embedding local). Sem ORM.

**Gate result: ALL PASS** — Complexity Tracking não necessário para violação; a dependência nova é requisito da feature, não desvio de camada.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/memory-store.md](./contracts/memory-store.md), [contracts/embeddings.md](./contracts/embeddings.md), [contracts/chat-http.md](./contracts/chat-http.md) mantêm borda HTTP, store atrás do service e composição pura. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/008-memoria-semantica/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── memory-store.md
│   ├── embeddings.md
│   └── chat-http.md
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── types.ts              # ← MemoryRecord, RecalledMemory, MemoryStore, Embedder
│   └── errors.ts             # ← InvalidMemoryInputError, MemoryNotFoundError, EmbeddingUnavailableError
├── memory/
│   ├── embeddings.ts         # ← NOVO: lazy singleton + createTransformersEmbedder
│   ├── embeddings.test.ts    # ← ensaio SC-003 (modelo real) e/ou smoke do singleton
│   ├── similarity.ts         # ← NOVO: dot, rankRecall, shouldDedup (puro)
│   ├── similarity.test.ts
│   ├── memory-store.ts       # ← NOVO: SqliteMemoryStore
│   └── memory-store.test.ts  # ← :memory: + fake Embedder
├── services/
│   ├── memory-prompt.ts      # ← NOVO: renderMemoryPrompt (puro)
│   ├── memory-prompt.test.ts
│   └── chat-service.ts       # ← userId + recall + composição
├── http/
│   ├── server.ts             # ← userId no Zod; memoryStore injetável
│   └── server.test.ts        # ← com/sem userId; 400; bloco no prompt
```

Fora desta feature (sem mudança de fluxo): `src/arena.ts`, `src/bench.ts`, `src/agents/*`, `src/mcp/`.

**Structure Decision**: Projeto único. Memória sob `src/memory/` (pedido do usuário), não misturada em `src/store/` — o store SQLite de memória fica ao lado do embedder. Composição de prompt no service (`memory-prompt` + `history-prompt` existentes). `createApp({ memoryStore })` espelha `conversationStore`.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
>
> Nota: `@huggingface/transformers` é dependência nova exigida pela spec (não um desvio de camada).
