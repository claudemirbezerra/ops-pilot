# Implementation Plan: Deploy web Pages

**Branch**: `017-deploy-web-pages` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-deploy-web-pages/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Publicar o front estático de `web/` no **GitHub Pages** via **GitHub Actions**: job `build` (`npm ci` + `npm run build` em `web/`, depois `actions/upload-pages-artifact`) e job `deploy` (`needs: build` + `actions/deploy-pages`) com permissões mínimas (`contents: read`, `pages: write`, `id-token: write`), concurrency `pages`, e **README na raiz** documentando fonte Pages = GitHub Actions e a URL do project site. Ajustar `base` do Vite para `/ops-pilot/` no build de Pages (repo `ops-pilot`) para FR-006.

## Technical Context

**Language/Version**: YAML de workflow GitHub Actions; Node.js 22 LTS no job de build (alinhado à constitution); TypeScript/Vite já em `web/`.

**Primary Dependencies**: `actions/checkout`, `actions/setup-node`, `actions/configure-pages` (opcional mas recomendado), `actions/upload-pages-artifact` (v3+ / v4 conforme pin estável), `actions/deploy-pages` (v4+ / v5 conforme pin estável). Sem novas deps npm no root.

**Storage**: N/A (artefato Actions efêmero + site Pages hospedado pela GitHub).

**Testing**: Validação local: `cd web && npm ci && npm run build` deve produzir `web/dist/` não vazio. Pipeline: build falho ⇒ `deploy` não roda (`needs`). Sem suite `node:test` obrigatória para YAML; checklist do [quickstart.md](./quickstart.md).

**Target Platform**: GitHub-hosted `ubuntu-latest`; site Pages project URL `https://claudemirbezerra.github.io/ops-pilot/` (owner/repo atuais do `origin`).

**Project Type**: CI/CD + documentação; não altera a API Express nem camadas do agente.

**Performance Goals**: Um ciclo de pipeline bem-sucedido publica a war room (SC-001); sem meta de RPS.

**Constraints**: Sem secrets no artefato (FR-007); menor privilégio no token; só linha principal (+ `workflow_dispatch`); API OpsPilot fora do Pages; falha de build não promove deploy.

**Scale/Scope**: 1 workflow, ajuste mínimo em `web/vite.config.ts` (base), README raiz novo/atualizado; path-filter opcional (fora do MVP).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS / N/A | Sem mudanças em controller/service/model; só CI + docs + `base` Vite. |
| II | **Funções puras** | ✅ PASS / N/A | Nenhuma lógica de domínio nova. |
| III | **Validações na fronteira** | ✅ PASS / N/A | Sem nova borda HTTP/CLI. |
| IV | **Erros de domínio** | ✅ PASS / N/A | Falhas ficam no status do job Actions. |
| V | **Teste é parte da tarefa** | ✅ PASS | `web` build + typecheck locais no quickstart; `deploy` gated por `needs: build`. |
| VI | **Segurança por padrão** | ✅ PASS | Sem secrets no `dist`; permissões mínimas; API URL só via engrenagem/`localStorage`. |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase). |
| VIII | **Pequeno e reversível** | ✅ PASS | Um workflow + base Vite + README; reversível apagando o workflow. |

**Stack**: ✅ Não altera stack do agente; Node 22 no runner de build. Sem ORM/MySQL.

**Gate result: ALL PASS** — Complexity Tracking não necessário.

**Re-check pós Phase 1**: [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) mantêm artifact→deploy, least privilege e sem secrets. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/017-deploy-web-pages/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pages-workflow.md
│   └── readme-pages.md
└── tasks.md                 # /speckit-tasks — NÃO gerado aqui
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── deploy-pages.yml     # NOVO: build → upload-pages-artifact → deploy-pages

web/
├── package.json             # inalterado (scripts build existentes)
├── vite.config.ts           # ← base `/ops-pilot/` (ou via env) para project Pages
└── dist/                    # gerado no CI (não versionar)

README.md                    # NOVO (ou atualizado): seção War Room / GitHub Pages
```

**Structure Decision**: Infra de publicação no repositório (`.github/workflows` + README raiz). O app continua isolado em `web/`; único ajuste de app é o `base` do Vite para o path do project site.

## Complexity Tracking

> Sem violações a justificar.
