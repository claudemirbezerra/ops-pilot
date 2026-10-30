# Quickstart: Deploy web Pages

Validação ponta a ponta após implementação. Contratos: [pages-workflow.md](./contracts/pages-workflow.md), [readme-pages.md](./contracts/readme-pages.md).

## Prerequisites

- Node 22 LTS local
- Repo com Pages Source = **GitHub Actions** (Settings → Pages) — necessário só para o passo remoto
- Permissão para ver Actions / Pages no GitHub

## 1. Build local do artefato

```bash
cd web
npm ci
npm run build
```

**Esperado**:
- Exit code 0
- Diretório `web/dist/` existe e contém `index.html` (+ assets)
- Em `web/dist/index.html`, referências de script/css usam o prefixo `/ops-pilot/` (base Pages)

## 2. Review do workflow

Abrir `.github/workflows/deploy-pages.yml` (ou nome documentado no README) e conferir:

- [ ] Triggers `push` em `main`/`master` + `workflow_dispatch`
- [ ] `permissions`: `contents: read`, `pages: write`, `id-token: write`
- [ ] Job `build` → `upload-pages-artifact` com path `web/dist`
- [ ] Job `deploy` com `needs: build` e `actions/deploy-pages`
- [ ] `concurrency.group: pages`, `cancel-in-progress: false`

## 3. README

Abrir `README.md` na raiz e confirmar a seção Pages (contrato [readme-pages.md](./contracts/readme-pages.md)): pipeline, Source=Actions, URL, nota da API.

## 4. Deploy remoto (manual)

1. Push do workflow (+ base Vite + README) para `master`/`main`, **ou** Actions → workflow → **Run workflow**.
2. Aguardar job `build` verde e job `deploy` verde.
3. Abrir `https://claudemirbezerra.github.io/ops-pilot/` (ou URL em Settings → Pages / `page_url`).
4. **Esperado**: war room carrega (shell da SPA); engrenagem ainda aponta API configurável (sem secret no HTML).

## 5. Falha de build não promove (smoke)

Opcional: introduzir erro temporário no build, push/run, confirmar `build` red e `deploy` skipped; site anterior intacto.

## 6. Regressão do monorepo

Na raiz (após mudanças desta feature — tipicamente só CI/docs/`vite` base):

```bash
npm run typecheck
npm test
```

**Esperado**: verdes (sem regressão na API). Em `web/`: `npm run typecheck` (e testes se existirem) verdes.
