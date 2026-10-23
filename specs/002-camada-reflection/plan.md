# Implementation Plan: Camada Reflection

**Branch**: `002-camada-reflection` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-camada-reflection/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

O plantonista envolve qualquer estratégia de raciocínio já existente (`react`, `plan-and-execute`) com uma camada de reflexão: a base responde; um crítico avalia a resposta à luz das observações do rastro e aprova ou devolve feedback; se reprovar, a base regenera com o feedback no contexto até aprovação ou até o teto de reflexões (padrão 2). Cada crítica entra no rastro como `critique`; as métricas somam consultas da base, do crítico e das regenerações. A arena passa a aceitar `reflect:react` e `reflect:plan-and-execute` sem remover as bases.

O envoltório é um laço determinístico (evaluator-optimizer) que chama a estratégia base e um crítico injetável; o crítico de produção usa o mesmo modelo OpenRouter com saída estruturada Zod. Testes offline substituem base e crítico.

## Technical Context

**Language/Version**: Node 22 LTS, TypeScript ESM strict (`"type": "module"`, `module`/`moduleResolution`: NodeNext)

**Primary Dependencies**: `@langchain/openai` (`ChatOpenAI.withStructuredOutput` no crítico), `@langchain/core`, Zod 4 na borda e no schema do crítico. Reutiliza `@langchain/langgraph` só nas estratégias base já existentes — o envoltório de reflexão não abre um grafo novo.

**Storage**: N/A para esta feature. Sem novas tabelas; o store em memória das ferramentas permanece o de `001-nucleo-raciocinio`.

**Testing**: `node:test` via `tsx`, `src/**/*.test.ts`. Ciclo de reflexão, mescla de rastro/métricas e validação de flags da arena sem rede. `npm run typecheck` e `npm test` verdes.

**Target Platform**: CLI local (arena). Sem borda HTTP nova.

**Project Type**: Extensão do núcleo de agentes + borda CLI da arena.

**Performance Goals**: Uma comparação por vez. Com teto 2: no pior caso 1 passagem inicial + 2 regenerações da base + até 3 avaliações do crítico. Tempo = ciclo completo (`latencyMs`).

**Constraints**: Temperatura 0; mesma fábrica de modelo do núcleo; teto de reflexões padrão 2; teto &lt; 1 recusado na borda; pedido vazio não chama o crítico; bases `react` / `plan-and-execute` continuam selecionáveis; sem canal HTTP novo.

**Scale/Scope**: Duas variantes nomeadas de reflexão, um crítico, um teto configurável, reuso do contrato `StrategyResult` / rastro já tipado.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Resultado | Como o desenho cumpre |
|-----------|-----------|------------------------|
| I. Camadas explícitas | Passa | `src/arena.ts` é a borda CLI. Serviço/domínio da reflexão vive em `src/agents/` (`reflection.ts`, `critic.ts`). Sem acesso a model Sequelize. |
| II. Funções puras | Passa | Decisão de continuar/parar, mescla de rastros/métricas, montagem do pedido com feedback e formatação do conteúdo de `critique` são puras. IO (base, crítico LLM) fica no serviço do envoltório. |
| III. Validações na fronteira | Passa | `--strategies` (inclui `reflect:*`), `--max-reflections` e `--max-iterations` passam por Zod na arena antes do domínio. |
| IV. Erros de domínio | Passa | Estratégia desconhecida e teto de reflexões &lt; 1 são classes de domínio; a borda traduz em texto e código 1. |
| V. Teste é parte da tarefa | Passa | Laço de reflexão e validação de flags nascem com teste determinístico (base/crítico simulados). |
| VI. Segurança por padrão | Passa | Mesma fábrica; sem ler `.env`; crítico não chama ferramentas destrutivas. |
| VII. Spec antes de código | Passa | Este plano segue `002-camada-reflection`. |
| VIII. Pequeno e reversível | Passa | Fatias: tipos/opções, crítico, envoltório, arena, testes. `tasks.md` fica para `/speckit-tasks`. |

Nenhuma violação exige registro em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-camada-reflection/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── reflection-layer.md
│   └── arena-cli.md
└── tasks.md              # /speckit-tasks, não desta fase
```

### Source Code (repository root)

```text
src/
├── arena.ts                          # borda CLI: aceita reflect:* e --max-reflections
├── agents/
│   ├── strategy.ts                   # nomes reflect:*, StrategyOptions.maxReflections
│   ├── reflection.ts                 # envoltório: laço base → crítico → regenerar
│   ├── critic.ts                     # crítico LLM (structured output) + porta injetável
│   ├── react.ts                      # base (inalterada no contrato)
│   ├── plan-and-execute.ts           # base (inalterada no contrato)
│   ├── model.ts                      # reutilizado pelo crítico
│   ├── trace.ts                      # formatTrace já cobre critique
│   └── *.test.ts                     # reflection + arena-args
└── domain/errors.ts                  # InvalidMaxReflectionsError (ou equivalente)

src/**/*.test.ts
```

**Structure Decision**: Continua o projeto único do núcleo. A reflexão é um decorator/fábrica sobre `ReasoningStrategy`, não um terceiro grafo LangGraph. Contratos da feature documentam o envoltório e a extensão da arena; o contrato de rastro/métricas de `001` permanece a base.

## Complexity Tracking

Nenhuma violação da constituição precisa de justificativa nesta feature.

## Post-design Constitution Check

Revisto depois de `research.md`, `data-model.md`, `contracts/` e `quickstart.md`. O crítico injetável é porta de teste, não atalho de camada. Saída estruturada Zod no crítico é validação na fronteira do modelo → domínio. Gates I–VIII seguem passando.
