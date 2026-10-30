# Research: Deploy web Pages

## 1. Fluxo oficial Pages via Actions

**Decision**: Dois jobs — `build` (checkout → setup-node 22 → `npm ci`/`npm run build` em `web/` → `actions/upload-pages-artifact` com `path: web/dist`) e `deploy` (`needs: build`, environment `github-pages`, `actions/deploy-pages`).

**Rationale**: Documentação GitHub e actions oficiais separam upload do artifact e deploy; `deploy` só corre se `build` suceder → FR-004. Spec pede explicitamente upload-pages-artifact + deploy-pages.

**Alternatives considered**:
- Branch `gh-pages` com commit de `dist` — rejeitado (FR-002: sem commit manual/branch de páginas).
- Um único job build+deploy — possível, mas dois jobs deixam o gate `needs` mais claro e alinham ao starter workflow.

## 2. Permissões e environment

**Decision**: No workflow (ou no job `deploy`): `permissions: { contents: read, pages: write, id-token: write }`. Environment name: `github-pages`; URL a partir de `steps.deployment.outputs.page_url`.

**Rationale**: `pages: write` + `id-token: write` são o mínimo exigido por `deploy-pages` (OIDC + API de deploy). `contents: read` basta para checkout. FR-003.

**Alternatives considered**:
- `permissions: write-all` — rejeitado (menor privilégio).
- Environment com outro nome — possível, mas `github-pages` é o default recomendado.

## 3. Versões das actions

**Decision**: Pinar majors estáveis atuais na implementação: `actions/checkout@v4` (ou v5/v6 se já padrão no org), `actions/setup-node@v4`, `actions/configure-pages@v5` (opcional), `actions/upload-pages-artifact@v3` ou `@v4`, `actions/deploy-pages@v4` ou `@v5` — escolher o major mais recente documentado no momento do implement.

**Rationale**: Docs GitHub misturam v3/v4/v5; o contrato exige o *fluxo*, não um patch pin. Implementação deve usar tags major oficiais, não `@main`.

**Alternatives considered**: Pin SHA completo — mais seguro, fora do MVP do curso.

## 4. Triggers e concurrency

**Decision**: `on.push.branches: [main, master]` (cobrir default atual `master` e futuro `main`) + `workflow_dispatch`. `concurrency: { group: pages, cancel-in-progress: false }`.

**Rationale**: Spec assume linha principal; repo hoje está em `master`. Concurrency do starter Pages evita deploys cruzados sem cancelar o deploy em curso.

**Alternatives considered**:
- Path filter só `web/**` — desejável, fora do MVP (spec).
- Só `main` — quebraria no repo atual (`master`).

## 5. Vite `base` para project Pages

**Decision**: Configurar `base: '/ops-pilot/'` no Vite para builds destinados ao project site `https://<owner>.github.io/ops-pilot/`. Preferir env (ex. `VITE_BASE` / flag no CI) se o dev local precisar de `base: '/'`; senão `base: '/ops-pilot/'` fixo e documentar que preview local usa o mesmo path ou `vite preview` com base.

**Rationale**: Sem `base` alinhado, assets 404 no Pages (FR-006). Repo remoto: `claudemirbezerra/ops-pilot`. Spec 016 falava base `/opspilot` para **API prefix**, não Vite `base` — hoje `vite.config.ts` usa default `/`.

**Alternatives considered**:
- User/org site (`username.github.io`) com `base: '/'` — não é o caso deste repo.
- `base: '/opspilot/'` — conflitaria com path do project Pages (`/ops-pilot/`) e com o prefixo HTTP da API.

## 6. README na raiz

**Decision**: Criar `README.md` na raiz (não existe hoje) com seção War Room / GitHub Pages: pipeline, pré-requisito Settings → Pages → Source = GitHub Actions, URL esperada, nota de que a API não está no Pages e a URL da API fica na engrenagem. Opcional: link para `web/README.md` para run local.

**Rationale**: FR-005; aceitar criar arquivo novo quando ausente.

**Alternatives considered**: Só atualizar `web/README.md` — insuficiente (spec: README do repositório / raiz).

## 7. Pré-requisito humano Pages

**Decision**: Documentar no README; o workflow não “liga” Pages sozinho. Até Source = Actions, o job `deploy` pode falhar.

**Rationale**: Limitação da plataforma; alinhado às assumptions da spec.

**Alternatives considered**: N/A — sem API admin no escopo.
