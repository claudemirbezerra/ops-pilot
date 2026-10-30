# OpsPilot

Copiloto de plantão para alertas e incidentes de produção (agente LangChain/LangGraph sobre OpenRouter).

## Run (API)

```bash
npm install
npm run dev
```

War room local: ver [`web/README.md`](web/README.md).

## War Room / GitHub Pages

A SPA em `web/` é publicada automaticamente no **GitHub Pages** pelo workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) (`actions/upload-pages-artifact` → `actions/deploy-pages`). Não usamos branch `gh-pages` nem commit de `web/dist`.

**Pré-requisito (uma vez):** Settings → Pages → Source = **GitHub Actions**.

**Triggers:** `push` em `main` ou `master`, e `workflow_dispatch` (Actions → Deploy war room to GitHub Pages → Run workflow).

**URL do project site:** [https://claudemirbezerra.github.io/ops-pilot/](https://claudemirbezerra.github.io/ops-pilot/)  
(Após o primeiro deploy bem-sucedido também aparece em Settings → Pages e no output `page_url` do job `deploy`.)

O Vite usa `base: /ops-pilot/` para assets no project site. Em falha de build, o job `deploy` não corre e a versão anterior do site permanece.

**API:** o Pages **não** hospeda a API OpsPilot. Na war room, configure a URL da API na engrenagem (`localStorage`). Detalhes de run local em [`web/README.md`](web/README.md).
