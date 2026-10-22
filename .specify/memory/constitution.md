<!--
Sync Impact Report
- Version change: unratified template → 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. Camadas explícitas
  - [PRINCIPLE_2_NAME] → II. Funções puras
  - [PRINCIPLE_3_NAME] → III. Validações na fronteira
  - [PRINCIPLE_4_NAME] → IV. Erros de domínio
  - [PRINCIPLE_5_NAME] → V. Teste é parte da tarefa
- Added principles: VI. Segurança por padrão, VII. Spec antes de código, VIII. Pequeno e reversível
- Added sections: Stack obrigatória, Fluxo de desenvolvimento
- Removed sections: none
- Follow-up TODOs: none
-->

# OpsPilot Constitution

## Core Principles

### I. Camadas explícitas

Dependências DEVEM fluir controller -> service -> model. Controller NÃO DEVE
acessar model. Service NÃO DEVE expor HTTP nem CLI.

### II. Funções puras

Lógica nova DEVE ser função pura: mesma entrada, mesma saída, sem IO e sem
estado escondido.

### III. Validações na fronteira

Toda entrada externa HTTP ou CLI DEVE ser validada com Zod antes de virar
domínio.

### IV. Erros de domínio

Falhas previsíveis DEVEM ser classes de erro de domínio. A borda DEVE traduzi-las
em status HTTP ou saída de CLI.

### V. Teste é parte da tarefa

Nenhuma lógica nova DEVE entrar sem teste. `npm run typecheck` e `npm test`
DEVEM permanecer verdes.

### VI. Segurança por padrão

Segredos NÃO DEVEM entrar no repositório. `.env` NÃO DEVE ser lido. Ações
destrutivas DEVEM passar pela deny list, não pela confiança no modelo.

### VII. Spec antes de código

Mudanças relevantes DEVEM passar por specify -> plan -> tasks -> implement ->
converge, com revisão humana entre as fases. Artefatos DEVEM ficar em `specs/`
e DEVEM ser versionados no git.

### VIII. Pequeno e reversível

Cada tarefa DEVE caber em um commit.

## Stack obrigatória

Node 22 LTS, TypeScript ESM strict (`"type": "module"`), Zod, `node:test` via
tsx, Express, Sequelize, MySQL, LangChain/LangGraph (`@langchain/core`,
`@langchain/langgraph`, `@langchain/openai`) sobre OpenRouter.

APO é o agente LangChain/LangGraph sobre OpenRouter. O banco é MySQL, acessado
por Sequelize. Express é a borda HTTP.

## Fluxo de desenvolvimento

`/speckit-constitution` roda uma vez. Por feature, com revisão humana entre as
fases: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement` → `/speckit-converge`.

Comandos do projeto:

- `npm run dev` — `tsx src/index.ts`
- `npm run arena` — `tsx src/arena.ts`
- `npm run bench` — `tsx src/bench.ts`
- `npm test` — `node --import tsx --test "src/**/*.test.ts"`
- `npm run typecheck` — `tsc --noEmit`

Uma tarefa só termina com `npm run typecheck` e `npm test` verdes.

## Governance

Esta constituição substitui práticas conflitantes. Emendas DEVEM atualizar este
arquivo, incrementar a versão semver e a data de alteração.

- MAJOR: remoção ou redefinição incompatível de princípio.
- MINOR: princípio ou seção nova, ou expansão material.
- PATCH: clarificação, redação ou correção sem mudança de regra.

Reviews DEVEM verificar conformidade com estes princípios. A orientação de
runtime está em `.cursor/rules/cursor-instructions.mdc`. A cópia curta em
`specs/constitution.md` DEVE permanecer alinhada a este arquivo.

**Version**: 1.0.0 | **Ratified**: 2026-10-22 | **Last Amended**: 2026-10-22
