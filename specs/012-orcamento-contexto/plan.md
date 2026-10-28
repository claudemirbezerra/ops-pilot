# Implementation Plan: Orçamento de contexto por seção

**Branch**: `012-orcamento-contexto` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-orcamento-contexto/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Introduzir `src/context/context-builder.ts`: montador puro do prompt composto usado por **todas** as estratégias via `runChat`. Tetos por seção via `process.env` `CONTEXT_BUDGET_*` (padrões: resumo 200, janela 1200, memória 300; sistema e mensagem atual intocáveis). Janela corta mensagens mais antigas; memória corta menor score; resumo trunca texto para caber. Unidade = `estimateTokens` (chars÷4). Testes com tetos baixos provam a ordem de corte. Sem schema novo; sem mudança de contrato HTTP além do breakdown refletir seções já orçadas.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Existentes — `estimateTokens` (`src/context/tokens.ts`), `renderHistoryPrompt` / `renderSummaryPrompt`, `renderMemoryPrompt`, `runChat`. Sem dependência npm nova.

**Storage**: N/A (sem persistência nova; orçamento é só na montagem do prompt)

**Testing**: `node:test` via `tsx`. Fixtures determinísticas de mensagens/scores; `process.env` isolado nos testes de budget; wire leve em `chat-service` / HTTP se necessário para “todas as estratégias”

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`)

**Project Type**: Agente + borda HTTP já existente

**Performance Goals**: Montagem O(n) nas seções cortáveis; sem chamada LLM extra; custo negligível vs. estratégia

**Constraints**: Código não lê arquivo `.env` (constituição); lê só `process.env`. Sistema + mensagem nunca truncados. Sem orçamento global. Não altera `HISTORY_LIMIT=8` nem sumarização/recall. Determinismo (empate de score estável).

**Scale/Scope**: Um processo. Touches: `context-builder` (+test), leitura de budgets, wire em `chat-service` (substituir join manual), tipagem de recall com score na montagem; breakdown continua estimado pós-corte.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | Builder em `src/context/` (puro). Orquestração continua em `chat-service`. HTTP só serializa métricas já existentes. |
| II | **Funções puras** | ✅ PASS | `buildContext` / cortes / resolve de budgets a partir de um mapa env injetável — sem I/O. |
| III | **Validações na fronteira** | ✅ PASS | Env parseada no resolve de budgets (números inválidos → default). Body `/chat` inalterado. |
| IV | **Erros de domínio** | ✅ PASS | Sem novo erro de domínio; orçamento não falha o turno. |
| V | **Teste é parte da tarefa** | ✅ PASS | Teste dedicado de ordem de corte com tetos baixos + typecheck/suíte verdes. |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo; não lê `.env`; só `CONTEXT_BUDGET_*` em `process.env`. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: budgets → cortes puros → builder → wire chat-service → testes. |

**Stack**: ✅ Node 22, Zod (borda existente), Express, `node:sqlite` (inalterado), LangChain/OpenRouter. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/context-builder.md](./contracts/context-builder.md), [contracts/context-budget-env.md](./contracts/context-budget-env.md), [quickstart.md](./quickstart.md) mantêm builder puro, env via `process.env`, wire só em `chat-service`, HTTP sem campos novos. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/012-orcamento-contexto/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── context-builder.md
│   └── context-budget-env.md
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts                 # reutilizado (estimateTokens)
│   ├── context-builder.ts        # NOVO: budgets + buildContext + cortes
│   └── context-builder.test.ts   # NOVO: tetos baixos, ordem de corte
├── services/
│   ├── chat-service.ts           # ← wire: monta seções → buildContext → strategy.run
│   ├── history-prompt.ts         # reutilizado (render; HISTORY_LIMIT intacto)
│   └── memory-prompt.ts          # reutilizado (render pós-corte)
├── agents/
│   └── strategy.ts               # inalterado (continua recebendo string prompt)
└── http/
    └── server.test.ts            # opcional: asserts breakdown ≤ tetos se útil
```

**Structure Decision**: Projeto único. Novo módulo puro em `src/context/` ao lado de `tokens.ts`. Composição deixa de ser `parts.join` ad-hoc em `chat-service` e passa pelo builder. Estratégias não mudam a assinatura `run(input: string)` — o caminho único já é `runChat`.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
