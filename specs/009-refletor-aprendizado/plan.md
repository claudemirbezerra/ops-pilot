# Implementation Plan: Refletor de aprendizado

**Branch**: `009-refletor-aprendizado` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-refletor-aprendizado/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Após cada `/chat` bem-sucedido com `userId`, um extrator estruturado `{ hasLearning, fact }` (LangChain `withStructuredOutput`, padrão Critic) lê a última mensagem do usuário e, se houver fato durável, chama `memoryStore.remember` em fire-and-forget — sem atrasar a resposta. Pedidos pontuais e segredos não geram memória. Nova tool `forget_preference` (recall ≥ 0,3 → forget por id) recebe `userId`/`memoryStore` via `StrategyOptions`. Reusa 008; sem schema HTTP/SQLite novo.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Express, Zod, `node:sqlite`, LangChain já existente (`withStructuredOutput` / `@langchain/core/tools`). Sem dependência npm nova.

**Storage**: Mesmo SQLite / tabela `memories` da feature 008. Sem DDL novo. Testes `:memory:` + embedder fake.

**Testing**: `node:test` via `tsx`. Stub de `LearningExtractor`; store fake/ deferred para não-bloqueio; tools unitárias; `/chat` com registry substituto.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente + borda HTTP já existente

**Performance Goals**: Extrator e *remember* fora do caminho crítico da resposta. Timeout `/chat` permanece 180s. Sem retry obrigatório no aprendizado.

**Constraints**: Máx. 1 fato/turno; assíncrono pós-resposta; nunca segredo/pedido pontual; `forget_preference` exige `userId`; arena/bench fora; código não lê `.env`.

**Scale/Scope**: Um processo. Touches: `chat-service`, `learning-*`, `tools`, `StrategyOptions` (react / plan-and-execute), `createApp` (injeção do extrator), erros de domínio, testes. Sem endpoints CRUD de memória.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP só injeta deps. `runChat` agenda aprendizado. Extrator em `agents/`; gate/schedule em `services/`; persistência só via MemoryStore. Tools não fazem SQL direto. |
| II | **Funções puras** | ✅ PASS | `shouldRemember` puro. Prompt/schema constantes. I/O no extrator LLM e no store. |
| III | **Validações na fronteira** | ✅ PASS | Body `/chat` já Zod. Tool `forget_preference` com schema Zod. Decisão pós-extract revalidada pelo gate. |
| IV | **Erros de domínio** | ✅ PASS | Sem `userId` na tool → erro de domínio virando observação. Falhas async do refletor não viram 5xx no chat já respondido. |
| V | **Teste é parte da tarefa** | ✅ PASS | Fixtures durável/pontual/segredo; não-bloqueio; forget hit/miss; regressão sem `userId`. |
| VI | **Segurança por padrão** | ✅ PASS | Prompt + testes proíbem persistir segredo. Sem secret novo no repo. SQL continua parametrizado no store 008. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: extrator+gate, schedule no chat, tool+options, testes de não-bloqueio. |

**Stack**: ✅ Node 22, Zod, Express, `node:sqlite`, LangChain/OpenRouter já na constituição. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/learning-reflector.md](./contracts/learning-reflector.md), [contracts/forget-preference.md](./contracts/forget-preference.md), [contracts/chat-http.md](./contracts/chat-http.md) mantêm borda HTTP magra, aprendizado no service e tool atrás de `StrategyOptions`. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/009-refletor-aprendizado/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── learning-reflector.md
│   ├── forget-preference.md
│   └── chat-http.md
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── types.ts                 # (opcional) reexport LearningDecision se útil
│   └── errors.ts                # ← UserIdRequiredError (ou equivalente)
├── agents/
│   ├── learning-extractor.ts    # ← NOVO: schema, prompt, createLlmLearningExtractor, tipo LearningExtractor
│   ├── learning-extractor.test.ts
│   ├── tools.ts                 # ← forget_preference + deps memoryStore/userId
│   ├── tools.test.ts            # ← casos forget_preference
│   ├── strategy.ts              # ← StrategyOptions.userId?, memoryStore?; ToolName
│   ├── react.ts                 # ← repassa options às tools
│   └── plan-and-execute.ts      # ← idem
├── services/
│   ├── learning-reflector.ts    # ← NOVO: shouldRemember (puro) + scheduleLearning
│   ├── learning-reflector.test.ts
│   └── chat-service.ts          # ← dispara scheduleLearning pós-sucesso; passa options
├── http/
│   ├── server.ts                # ← createApp({ learningExtractor? })
│   └── server.test.ts           # ← integração async / sem userId
└── memory/                      # reuso 008 (sem DDL)
```

Fora do fluxo padrão desta feature: `src/arena.ts`, `src/bench.ts` (sem learning automático).

**Structure Decision**: Projeto único. Extrator LLM ao lado do Critic (`agents/`). Orquestração assíncrona no service (`learning-reflector` + `chat-service`), não no controller. Tool no inventário Ops existente com contexto injetado — sem segundo factory de agente.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
