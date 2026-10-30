# Contract: GitHub Pages workflow

**Path**: `.github/workflows/deploy-pages.yml` (nome canônico; sinônimo aceitável `pages.yml` se documentado no README)

## Triggers

| Event | Filter |
|-------|--------|
| `push` | branches: `main`, `master` |
| `workflow_dispatch` | — |

## Top-level settings

| Key | Value |
|-----|-------|
| `permissions.contents` | `read` |
| `permissions.pages` | `write` |
| `permissions.id-token` | `write` |
| `concurrency.group` | `pages` |
| `concurrency.cancel-in-progress` | `false` |

Nenhuma outra permissão de escrita (`contents: write`, `pull-requests`, etc.) no MVP.

## Job `build`

| Step (ordem) | Expectativa |
|--------------|-------------|
| Checkout | Código do commit do run |
| Setup Node | Node **22** (LTS do projeto) |
| Install + build | Em `web/`: `npm ci` e `npm run build` |
| Upload artifact | `actions/upload-pages-artifact` com `path` apontando para o diretório de saída (`web/dist`) |

**Failure rule**: Qualquer falha antes/durante o upload ⇒ job `build` failed ⇒ job `deploy` **não** executa.

## Job `deploy`

| Requirement | Value |
|-------------|--------|
| `needs` | `build` |
| `environment.name` | `github-pages` |
| `environment.url` | `${{ steps.deployment.outputs.page_url }}` (ou equivalente do step) |
| Deploy step | `actions/deploy-pages` com `id: deployment` |

## Non-goals

- Deploy da API OpsPilot
- Commit em branch `gh-pages`
- Injetar `OPENROUTER_API_KEY` ou URL secreta no build

## Acceptance mapping

| Spec | Contract |
|------|----------|
| FR-001, FR-002 | build + upload + deploy |
| FR-003 | permissions table |
| FR-004 | `needs: build` |
| FR-006 | site servido após deploy (base Vite alinhada — ver plan/research) |
| FR-007 | sem secrets no build |
