# Implementation Plan: Núcleo de raciocínio

**Branch**: `001-nucleo-raciocinio` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-nucleo-raciocinio/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

O plantonista carrega um catálogo fixo (5 serviços, 6 alertas) e pede ao copiloto que liste alertas, abra incidente e resolva incidente. Duas estratégias devolvem o mesmo contrato: resposta, rastro tipado e métricas (consultas ao modelo e tempo decorrido). ReAct usa o agente pré-construído do LangGraph. Plan-and-Execute é um grafo com planner, executor e replanner, com teto de 8 passos.

O catálogo primário já existe como dado puro e como carga Sequelize/MySQL (`npm run seed`). As ferramentas do agente operam sobre uma cópia em memória desse mesmo catálogo, para a conferência sem rede. A arena (`npm run arena`) escolhe estratégias e o teto de iterações, valida a entrada com Zod e traduz erro de domínio na borda.

## Technical Context

**Language/Version**: Node 22 LTS, TypeScript ESM strict (`"type": "module"`, `module`/`moduleResolution`: NodeNext)

**Primary Dependencies**: `@langchain/langgraph` (agente ReAct em `@langchain/langgraph/prebuilt`), `@langchain/core` (mensagens e `tool`), `@langchain/openai` (`ChatOpenAI` contra o OpenRouter), Zod 4 na borda, Sequelize 6

**Storage**: MySQL via Sequelize para a carga do catálogo (`services`, `alerts`). Cópia em memória, sem rede, para as ferramentas e para os testes do store. Incidentes existem só nessa cópia.

**Testing**: `node:test` via `tsx`, arquivos `src/**/*.test.ts`. Conferências de store e de formatação de rastro não abrem rede nem banco. `npm run typecheck` e `npm test` permanecem verdes.

**Target Platform**: CLI local no Windows/macOS/Linux (Node 22). A borda HTTP fica fora desta feature.

**Project Type**: CLI de arena e de carga, com núcleo de agentes em biblioteca interna.

**Performance Goals**: Uma comparação por vez, no máximo duas estratégias, cada uma limitada pelo teto de iterações (padrão 8) e, em Plan-and-Execute, por 8 passos. O tempo é o do modelo; a arena só precisa imprimir `latencyMs`.

**Constraints**: Temperatura 0. Uma única fábrica de modelo. Segredos só em `process.env` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `DB_*`); o código não lê `.env`. Ferramentas limitadas a `list_alertas`, `open_incident` e `resolver_incident`. Pedido vazio não altera o catálogo.

**Scale/Scope**: Um plantonista, duas estratégias, catálogo de 5 serviços e 6 alertas, incidentes criados durante a execução em memória.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Resultado | Como o desenho cumpre |
|-----------|-----------|------------------------|
| I. Camadas explícitas | Passa | `src/arena.ts` e `src/seed.ts` são a borda CLI. Chamam serviço. Serviço não imprime CLI nem HTTP. Sequelize fica em `src/models`, usado pelo serviço de carga. |
| II. Funções puras | Passa | Regras do catálogo, transições do store e formatação do rastro são puras. Consulta ao modelo e escrita no MySQL ficam no serviço, sem estado escondido nas funções puras. |
| III. Validações na fronteira | Passa | Flags da arena, ambiente da carga e argumentos das ferramentas passam por Zod antes do domínio. |
| IV. Erros de domínio | Passa | Recusas (estratégia, situação, serviço, incidente, configuração) são classes em `src/domain/errors.ts`. A borda CLI traduz em texto e código de saída. A ferramenta traduz a mesma recusa em observação, sem aplicar a transição. |
| V. Teste é parte da tarefa | Passa | Store e formatação de rastro nascem com teste determinístico. A tarefa de implementação só termina com `npm run typecheck` e `npm test` verdes. |
| VI. Segurança por padrão | Passa | Nenhum segredo no repositório. A fábrica lê o ambiente e falha com erro de domínio se a chave ou o modelo faltarem. As três ferramentas não executam comando nem chamam sistema externo. |
| VII. Spec antes de código | Passa | Este plano segue a spec `001-nucleo-raciocinio`. A carga do catálogo já materializada na fase specify entra como base, não como atalho das estratégias. |
| VIII. Pequeno e reversível | Passa | O trabalho cabe em fatias separadas (store e rastro, ferramentas, fábrica, ReAct, Plan-and-Execute, arena). `tasks.md` fica para `/speckit-tasks`. |

Nenhuma violação exige registro em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-nucleo-raciocinio/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── reasoning-strategy.md
│   ├── tools.md
│   ├── arena-cli.md
│   └── seed-cli.md
└── tasks.md              # /speckit-tasks, não desta fase
```

### Source Code (repository root)

```text
src/
├── arena.ts                          # borda CLI da comparação (novo)
├── seed.ts                           # borda CLI da carga (existente)
├── agents/
│   ├── strategy.ts                   # contrato ReasoningStrategy, tipos de rastro e métricas
│   ├── trace.ts                      # mapeamento e formatação puros do rastro
│   ├── model.ts                      # fábrica OpenRouter, temperatura 0
│   ├── store.ts                      # transições puras do catálogo em memória
│   ├── tools.ts                      # três ferramentas Zod sobre o store
│   ├── react.ts                      # createReactAgent
│   └── plan-and-execute.ts           # planner, executor, replanner
├── domain/errors.ts                  # existente; ganha as recusas das ferramentas e da arena
├── db/                               # existente: config Zod + Sequelize
├── models/                           # existente: Service, Alert
├── seed/primary-catalog.ts           # existente: catálogo puro e schema Zod
└── services/catalog-seed-service.ts  # existente: carga MySQL

src/**/*.test.ts                      # node:test ao lado do código
```

**Structure Decision**: Projeto único, camadas model → service → borda CLI, testes colados no fonte porque `npm test` já globa `src/**/*.test.ts`. Não há pasta `tests/` separada nem borda HTTP nesta feature. O store em memória não é um model Sequelize: é estado de domínio puro consumido pelas ferramentas.

## Complexity Tracking

Nenhuma violação da constituição precisa de justificativa nesta feature.

## Post-design Constitution Check

Revisto depois de `research.md`, `data-model.md`, `contracts/` e `quickstart.md`. Os quatro contratos são interfaces da borda e do núcleo, não um atalho de camada. O adaptador das ferramentas segura a cópia do store só para encaixar na API de tool do LangChain; a transição continua pura e testada. Gates I–VIII seguem passando.
