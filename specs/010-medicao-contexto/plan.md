# Implementation Plan: Medição de contexto

**Branch**: `010-medicao-contexto` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-medicao-contexto/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Instrumentar tokens de contexto: utilitário puro `estimateTokens` (chars÷4) + leitura do usage real LangChain (`usage_metadata.input_tokens`); estratégias acumulam `metrics.promptTokens` no turno; `/chat` acrescenta `contextBreakdown` estimado (`history` / `memory`) sem mudar a composição do prompt; script `conversa-longa.sh` imprime `promptTokens` por turno. Sem DDL, sem dep npm nova.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Express, Zod, LangChain já existente (`AIMessage.usage_metadata`, `ChatOpenAI`). Sem dependência npm nova.

**Storage**: N/A (métricas só na resposta do turno; sem persistência nova)

**Testing**: `node:test` via `tsx`. Fixtures de texto/usage; registry/`StrategyResult` com `promptTokens` fixo; `createApp` + stores `:memory:`.

**Target Platform**: Processo Node local (`npm run dev`, `127.0.0.1`); script bash contra HTTP local

**Project Type**: Agente + borda HTTP já existente

**Performance Goals**: Estimativa O(n) no tamanho do texto composto (já montado). Leitura de usage no caminho das invokes existentes — sem round-trip extra ao provedor. Timeout `/chat` permanece 180s.

**Constraints**: Breakdown estimado ≠ `promptTokens` real (esperado). Fontes mínimas `history`+`memory`. Aprendizado assíncrono (009) **não** entra em `promptTokens` do turno. Arena/bench não obrigados a expor breakdown. Código não lê `.env`.

**Scale/Scope**: Um processo. Touches: `src/context/tokens.ts` (+test), `Metrics`/`runWithMetrics`, `createCountingModel` + plan-and-execute/reflection/critic para somar usage, `chat-service` (breakdown), testes HTTP, `conversa-longa.sh`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP só serializa `metrics`. Breakdown e agregação de chat em `chat-service`. Estimativa/leitura em `context/` (puro). Acúmulo de usage nas estratégias/`model`, não no controller. |
| II | **Funções puras** | ✅ PASS | `estimateTokens`, `readPromptTokens`, montagem de `contextBreakdown` a partir de strings — puras. I/O só nas invokes já existentes. |
| III | **Validações na fronteira** | ✅ PASS | Body `/chat` inalterado (Zod). Novos campos só na **saída** 200; tipos numéricos ≥ 0 garantidos na montagem do resultado. |
| IV | **Erros de domínio** | ✅ PASS | Sem erro de domínio novo. Usage ausente → 0, não exceção. |
| V | **Teste é parte da tarefa** | ✅ PASS | Testes de tokens, métricas `/chat` (com/sem memória, vazio), reflexão soma `promptTokens`; script coberto por quickstart (smoke). |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo. Métricas não expõem conteúdo do prompt, só contagens. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: tokens puros → Metrics/model → chat breakdown → reflection/critic → script → testes HTTP. |

**Stack**: ✅ Node 22, Zod, Express, `node:sqlite` (inalterado), LangChain/OpenRouter já na constituição. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/tokens.md](./contracts/tokens.md), [contracts/chat-http.md](./contracts/chat-http.md), [contracts/conversa-longa.md](./contracts/conversa-longa.md) mantêm borda HTTP magra, medição pura em `context/`, acúmulo de usage nas estratégias e breakdown só no service de chat. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/010-medicao-contexto/
├── plan.md                 # Este arquivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── tokens.md
│   ├── chat-http.md
│   └── conversa-longa.md
└── tasks.md                # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts              # ← NOVO: estimateTokens, readPromptTokens
│   └── tokens.test.ts         # ← NOVO
├── agents/
│   ├── strategy.ts            # ← Metrics.promptTokens; runWithMetrics repassa
│   ├── model.ts               # ← createCountingModel acumula promptTokens do AIMessage
│   ├── react.ts               # ← metrics.promptTokens via getPromptTokens()
│   ├── plan-and-execute.ts    # ← soma usage nas invokes / estado
│   ├── reflection.ts          # ← soma promptTokens base + critic (como llmCalls)
│   ├── critic.ts              # ← CriticEvaluateResult.promptTokens (0 em stub)
│   └── *.test.ts              # ← asserts de soma / default 0
├── services/
│   ├── chat-service.ts        # ← contextBreakdown; ChatResult.metrics estendido
│   └── chat-service.test.ts   # ← se existir / casos de breakdown
├── http/
│   └── server.test.ts         # ← 200 com promptTokens + contextBreakdown
conversa-longa.sh              # ← NOVO (raiz): N turnos, imprime promptTokens
```

Fora do escopo obrigatório desta feature: mudanças de schema em arena/bench (podem ignorar campos extras em `metrics`).

**Structure Decision**: Projeto único. Utilitário de tokens em `src/context/` (domínio de medição, sem HTTP). Acúmulo de usage real no mesmo ponto que já conta `llmCalls` (`createCountingModel` / plan-and-execute). Breakdown só no `chat-service`, que conhece as fontes `history` e `memory` antes da estratégia.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
