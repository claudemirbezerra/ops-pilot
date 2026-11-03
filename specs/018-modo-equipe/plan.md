# Implementation Plan: Modo equipe

**Branch**: `018-modo-equipe` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-modo-equipe/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A rota `team` entra no grafo de produção já existente, ao lado de `react`, `plan-and-execute` e `reflection`. O turno da equipe é um `StateGraph` próprio em `src/team/`: o supervisor lê um quadro no estado e devolve `withStructuredOutput({ next, brief })`; no máximo 8 decisões; cada uma vira um evento `handoff` com `node: "team"`. O analista só tem as quatro ferramentas de leitura e não escreve o plano. O planejador não recebe ferramentas. O executor só pede `open_incident` ou `resolver_incident` e para na aprovação humana já existente, sem chamar a ferramenta. Ver raciocínio mostra `handoff` como `{next}: {brief}`. `reflect` não envolve esta rota.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Já no projeto — `@langchain/langgraph` (`StateGraph`, aresta condicional), `@langchain/openai` (`withStructuredOutput` + `{ includeRaw: true }`), Zod 4, `createModel`, `readPromptTokens`, `requiresHumanApproval`, `createOpsTools`, `buildLimitReachedAnswer`. Sem dependência npm nova.

**Storage**: N/A para o quadro (só memória do turno). Rastro `handoff` persiste no payload JSON já usado por request e aprovação; sem migração.

**Testing**: `node:test` via `tsx` na raiz e em `web/`. Portas do supervisor e dos papéis injetáveis. Sem OpenRouter. `npm run typecheck` e `npm test` na raiz; `npm run typecheck` e `npm test` em `web/`.

**Target Platform**: Processo Node local (`npm run dev`) e war room já existente (`web/`)

**Project Type**: Agente LangGraph dentro do caminho de chat já existente, mais uma linha no painel de raciocínio

**Performance Goals**: No máximo 8 consultas do supervisor por turno `team`, mais as consultas dos papéis chamados. Override `strategy: "team"` não consulta o roteador. A nona decisão do supervisor não existe e não chama o modelo.

**Constraints**: Não ler `.env`. Teto fixo de 8, independente de `DEFAULT_MAX_ITERATIONS` (hoje também 8). Motivo de override continua `Estratégia informada no pedido.` Mensagem de decisão ilegível: `Não foi possível decidir o próximo papel.` Mensagem de papel ilegível: `Não foi possível cumprir o papel.` Executor não grava incidente antes da aprovação. Arena e bench fora. `node` continua opcional no tipo compartilhado com a arena.

**Scale/Scope**: Um processo, um turno por request, um quadro por turno. Quatro rotas no chat. Toques: tipo de rastro, erro de domínio, prompt do roteador, um nó no grafo de produção, formatadores de rastro (servidor e web).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | HTTP só traduz os erros novos → 502. `runChat` não conhece papéis. O grafo da equipe não importa Express. Stores não são lidas no controller. |
| II | **Funções puras** | ✅ PASS | Quadro, allowlist, `handoff`, teto e validação de `next`/`brief` são funções puras. Supervisor e papéis são portas injetáveis. I/O de ferramenta fica no adaptador do papel, como já ocorre em ReAct. |
| III | **Validações na fronteira** | ✅ PASS | Body do chat continua Zod. `strategy` `team` passa a ser rota conhecida no serviço. A decisão do supervisor é checada com Zod antes de emitir `handoff` ou chamar papel. |
| IV | **Erros de domínio** | ✅ PASS | `InvalidTeamDecisionError` e `InvalidTeamRoleError`. A borda mapeia as duas para 502. 400 / 422 / 504 / 503 existentes permanecem. Aprovação continua 202, não erro. |
| V | **Teste é parte da tarefa** | ✅ PASS | Puros, grafo com fakes, HTTP e o formatador de `web/src/lib/trace.ts`. Sem rede. Typecheck e suítes verdes. |
| VI | **Segurança por padrão** | ✅ PASS | Sem secret novo. Executor reusa o portão de `open_incident` e `resolver_incident` e não invoca a ferramenta. Analista não recebe ferramenta de escrita. 502 não ecoa o texto do modelo. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). Sem código de produção nesta fase. |
| VIII | **Pequeno e reversível** | ✅ PASS | Fatias: tipos e puros → grafo da equipe com fakes → fio no roteador e no registry → formatadores → HTTP. Arena intocada. |

**Stack**: ✅ Node 22, TypeScript ESM strict, Zod, `node:test` via tsx, Express, SQLite inalterado, LangChain/LangGraph sobre OpenRouter. Sem ORM. Sem dep nova.

**Gate result: ALL PASS** — Complexity Tracking vazio. Nenhum `NEEDS CLARIFICATION` restante.

**Re-check pós Phase 1**: [data-model.md](./data-model.md), [contracts/team-mode.md](./contracts/team-mode.md), [contracts/chat-http.md](./contracts/chat-http.md), [contracts/trace-handoff.md](./contracts/trace-handoff.md) e [quickstart.md](./quickstart.md) mantêm o quadro fora do SQLite, a decisão pura antes do papel, o 502 como erro de domínio e o executor atrás do portão já existente. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/018-modo-equipe/
├── plan.md                      # Este arquivo
├── research.md                  # Phase 0
├── data-model.md                # Phase 1
├── quickstart.md                # Phase 1
├── contracts/
│   ├── team-mode.md
│   ├── chat-http.md
│   └── trace-handoff.md
└── tasks.md                     # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/team/
├── board.ts                     # NOVO: quadro, applyRoleUpdate, renderBoard
├── board.test.ts                # NOVO
├── policy.ts                    # NOVO: next, handoff, teto 8, allowlists, prompts
├── policy.test.ts               # NOVO
├── team-graph.ts                # NOVO: StateGraph, portas, adaptadores LLM, teamStrategy
└── team-graph.test.ts           # NOVO: fakes, sem rede
src/agents/
├── strategy.ts                  # ← ProductionRoute, TraceNode, StrategyName, evento handoff
├── production-route.ts          # ← quarta rota, tabela, team sem wrap de reflect
├── production-route.test.ts     # ← deixa de exigir "quarta rota" proibida
├── production-graph.ts          # ← enum e nó team
├── production-graph.test.ts     # ← override e roteador fake → só team
├── index.ts                     # ← channelStrategies.team
└── trace.ts                     # ← formatTrace do handoff
src/domain/errors.ts             # ← InvalidTeamDecisionError, InvalidTeamRoleError
src/http/server.ts               # ← 502 dos dois erros
src/http/server.test.ts          # ← team aceito; decisão ruim 502; executor 202
web/src/lib/trace.ts             # ← tipo e formatTraceEvent `{next}: {brief}`
web/src/lib/trace.test.ts        # ← linha do handoff
```

**Structure Decision**: Projeto único. O ciclo da equipe mora em `src/team/` e entra no grafo de produção como mais uma estratégia (`teamStrategy.run`), no mesmo encaixe de ReAct e Plan-and-Execute. O `StateGraph` de produção não absorve o loop do supervisor. Helpers puros ficam em `board.ts` e `policy.ts` para a suíte não precisar do modelo. `runChat` não ganha ramo especial: `team` passa a ser `ProductionRoute`, então override, 422 e pedido vazio continuam no código que já existe. Ver raciocínio não ganha componente novo; `TracePanel` já imprime `event.type` e o texto de `formatTraceEvent`.

## Complexity Tracking

> Nenhuma violação de constituição — seção vazia de propósito.
