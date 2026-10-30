# Data Model: Deploy web Pages

Esta feature não introduz entidades de domínio persistidas na API. O modelo abaixo descreve artefatos e estados do pipeline de publicação.

## Entities

### SiteArtifact

Pacote estático gerado a partir de `web/` e enviado ao Pages.

| Field | Description | Validation |
|-------|-------------|------------|
| `path` | Diretório de saída do build | Deve ser `web/dist` após `npm run build` em `web/` |
| `contents` | HTML + assets (JS/CSS) | Não vazio; sem secrets de aplicação embutidos |
| `base` | Prefixo público dos assets | Alinhado ao path do project Pages (`/ops-pilot/`) |

**Relationships**: Produzido pelo job `build`; consumido pelo job `deploy` via artifact nomeado pelo `upload-pages-artifact` (default `github-pages`).

### PagesPublication

Versão do site servida na URL pública após deploy bem-sucedido.

| Field | Description | Validation |
|-------|-------------|------------|
| `url` | URL pública do site | Tipicamente `https://<owner>.github.io/ops-pilot/`; também `page_url` do step deploy |
| `source` | Origem de publicação | GitHub Actions (não branch `gh-pages`) |
| `revision` | Commit que gerou o artefato | Implicitamente o SHA do run |

**Relationships**: Sucede um `SiteArtifact` válido; permanece inalterada se o próximo `build` falhar.

### PublishPipeline

Workflow Actions que gera e promove o artefato.

| Field | Description | Validation |
|-------|-------------|------------|
| `triggers` | Eventos que disparam o run | `push` em `main`/`master`; `workflow_dispatch` |
| `permissions` | Escopos do `GITHUB_TOKEN` | ⊆ `{ contents: read, pages: write, id-token: write }` |
| `jobs` | `build` → `deploy` | `deploy.needs = build` |
| `concurrency` | Grupo de exclusão mútua suave | `group: pages`, `cancel-in-progress: false` |

### RepositoryReadme

Documento na raiz orientando contribuidores.

| Field | Description | Validation |
|-------|-------------|------------|
| `pagesSection` | Texto sobre publish automático | MUST cobrir pipeline, Source=Actions, URL/como obter |
| `apiNote` | Clarificação API vs Pages | MUST indicar que a API não é hospedada no Pages |

## State transitions

```text
[idle]
   │ push / workflow_dispatch
   ▼
[building] ──fail──► [failed]          (PagesPublication anterior intacta)
   │ success + artifact uploaded
   ▼
[deploying] ──fail──► [failed]         (sem nova publicação)
   │ success
   ▼
[published]  (PagesPublication atualizada)
```

## Out of scope

- Persistência SQLite / `OpsStore` / approvals
- Hospedagem da API Express no Pages
- Versionamento de `web/dist` no git
