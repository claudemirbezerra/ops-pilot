# Implementation Plan: Canal de chat

**Branch**: `003-canal-chat` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-canal-chat/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

O plantonista envia um turno para `POST /chat` e recebe `answer`, `trace` e `metrics`. O corpo traz `message`, `strategy` opcional (padrão `react`) e `reflect` opcional. Reflexão pedida envolve a estratégia resolvida com `wrapWithReflection` já existente; os nomes compostos da arena não são nomes deste canal. Corpo inválido responde 400 com `issues`. Nome fora do catálogo responde 422. Se o resultado não fica pronto em 180 segundos, a espera encerra com 504. O contrato se prova com um servidor de teste, catálogo injetado e estratégia substituta determinística, sem rede.

## Technical Context

**Language/Version**: Node 22 LTS, TypeScript ESM strict (`"type": "module"`, `module`/`moduleResolution`: NodeNext)

**Primary Dependencies**: Express 5 (já em `package.json`), Zod 4 na borda HTTP. Reutiliza `ReasoningStrategy`, `wrapWithReflection` e `UnknownStrategyError`. Sem cliente HTTP novo: o teste usa `fetch` do Node contra `listen(0)`.

**Storage**: N/A. O canal não persiste conversa. A execução de produção reutiliza o store que as estratégias já usam; rastro e métricas da resposta são só daquele `run`.

**Testing**: `node:test` via `tsx`, `src/**/*.test.ts`. Integração de `/chat` com estratégia e crítico substitutos, sem rede e sem esperar 180 segundos (limite injetável). `npm run typecheck` e `npm test` verdes.

**Target Platform**: Processo local. `npm run dev` escuta em `127.0.0.1` na porta `PORT` ou 3000.

**Project Type**: Borda HTTP nova sobre o núcleo de agentes já existente. A arena e o bench permanecem.

**Performance Goals**: Um turno por request. Limite de espera de 180 segundos cobre base e reflexão. O teste de tempo esgotado usa um limite curto injetado.

**Constraints**: Validar o corpo com Zod antes de resolver estratégia. Catálogo do canal só `react` e `plan-and-execute`. `reflect` aplica a camada existente com teto padrão 2. Não ler `.env`. Não criar autenticação, histórico nem teto no corpo. 400 e 422 são desfechos distintos. Texto vazio em `strategy` é 422.

**Scale/Scope**: Uma rota `POST /chat`, um catálogo de duas bases, quatro desfechos (200, 400, 422, 504) e um teste de integração offline.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Resultado | Como o desenho cumpre |
|-----------|-----------|------------------------|
| I. Camadas explícitas | Passa | `src/http/server.ts` é a borda. `src/services/chat-service.ts` resolve, executa e aplica o limite. O catálogo fica em `src/agents/index.ts`. A borda não acessa model Sequelize. O serviço não define status HTTP. |
| II. Funções puras | Passa | Schema do corpo e a escolha nome → estratégia (com ou sem reflexão) são determinísticos. O relógio do limite fica no serviço. |
| III. Validações na fronteira | Passa | `message`, `strategy` e `reflect` passam por Zod antes do domínio. Nome desconhecido não é erro de schema: é `UnknownStrategyError` depois do parse. |
| IV. Erros de domínio | Passa | Nome desconhecido reutiliza `UnknownStrategyError`. Tempo esgotado é `ChatTimeoutError`. A borda traduz em 422 e 504. `issues` do 400 permanece relatório Zod, não erro de domínio. |
| V. Teste é parte da tarefa | Passa | O contrato HTTP nasce com teste de integração e substitutos, sem rede. |
| VI. Segurança por padrão | Passa | Escuta só em loopback. Não lê `.env`. Não acrescenta ferramenta destrutiva. |
| VII. Spec antes de código | Passa | Este plano segue `003-canal-chat`. |
| VIII. Pequeno e reversível | Passa | Fatias: schema e catálogo, serviço, servidor, entrada `src/index.ts`, teste. `tasks.md` fica para `/speckit-tasks`. |

Nenhuma violação exige registro em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-canal-chat/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-http.md
│   └── strategy-registry.md
└── tasks.md              # /speckit-tasks, não desta fase
```

### Source Code (repository root)

```text
src/
├── index.ts                          # npm run dev: escuta o app em loopback
├── http/
│   └── server.ts                     # createApp, POST /chat, tradução de status
├── services/
│   └── chat-service.ts               # resolve + run + limite de espera
├── agents/
│   ├── index.ts                      # catálogo do canal; reflect → wrapWithReflection
│   ├── reflection.ts                 # reutilizado, sem contrato novo
│   ├── react.ts                      # base de produção
│   └── plan-and-execute.ts           # base de produção
├── domain/errors.ts                  # ChatTimeoutError
└── http/server.test.ts               # integração: fetch, catálogo injetado, sem rede

src/**/*.test.ts
```

**Structure Decision**: Continua o projeto único. A pasta é `src/agents/` (a que já existe), não `src/agent/`. O HTTP é fábrica testável (`createApp`) separada do `listen` de `src/index.ts`, no mesmo espírito do guarda de entrada da arena. Contratos desta feature: a rota e o catálogo do canal. O `StrategyResult` de `001` e o envoltório de `002` permanecem a base.

## Complexity Tracking

Nenhuma violação da constituição precisa de justificativa nesta feature.

## Post-design Constitution Check

Revisto depois de `research.md`, `data-model.md`, `contracts/` e `quickstart.md`. Injetar catálogo, crítico e `timeoutMs` em `createApp` é porta de teste, não atalho de camada. O 400 devolve `issues` do Zod na borda; o 422 só nasce depois, como erro de domínio. O limite curto do teste não muda o padrão de 180 segundos do `npm run dev`. Gates I–VIII seguem passando.
