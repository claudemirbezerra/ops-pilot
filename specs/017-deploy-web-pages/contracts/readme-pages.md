# Contract: README — seção GitHub Pages

**Path**: `README.md` na raiz do repositório (criar se ausente).

## Required content (mínimo)

A seção (título sugerido: **War Room / GitHub Pages** ou **Deploy da war room**) MUST incluir:

1. **O quê**: a SPA em `web/` é publicada automaticamente no GitHub Pages pelo workflow Actions (não por branch `gh-pages`).
2. **Pré-requisito**: em Settings → Pages, Source = **GitHub Actions** (passo humano uma vez).
3. **URL**: documentar a URL do project site  
   `https://claudemirbezerra.github.io/ops-pilot/`  
   **ou** o procedimento: Settings → Pages após o primeiro deploy bem-sucedido / output `page_url` do job.
4. **API**: deixar explícito que o Pages **não** hospeda a API OpsPilot; o plantonista configura a URL da API na engrenagem da war room (ver `web/README.md`).
5. **Workflow**: referência ao ficheiro (ex. `.github/workflows/deploy-pages.yml`) e triggers (`push` em `main`/`master`, `workflow_dispatch`).

## Optional

- Link para run local (`web/README.md`)
- Nota sobre `base` `/ops-pilot/` no Vite

## Forbidden

- Colar secrets, tokens ou chaves OpenRouter
- Instruir commit de `web/dist` no git como método de deploy

## Acceptance mapping

| Spec | Contract |
|------|----------|
| FR-005 | itens 1–5 |
| SC-003 | secção localizável em &lt; 2 min |
