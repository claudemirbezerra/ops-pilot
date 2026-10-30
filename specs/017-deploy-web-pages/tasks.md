# Tasks: Deploy web Pages

**Input**: Design documents from `/specs/017-deploy-web-pages/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Não solicitados formalmente na spec (sem suite `node:test` para YAML). Validação via build local + checklist [quickstart.md](./quickstart.md) e estrutura `needs: build` (US2).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Workflow: `.github/workflows/`
- War room: `web/`
- Docs: `README.md` (raiz)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pastas e ignores necessários ao pipeline Pages

- [ ] T001 Create directory `.github/workflows/` at repository root if missing
- [ ] T002 [P] Ensure `web/dist/` is ignored in root `.gitignore` (and/or `web/.gitignore`) so the Pages artifact is never committed

**Checkpoint**: Estrutura pronta para o YAML e sem risco de versionar `dist`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `base` Vite alinhado ao project Pages (`/ops-pilot/`) — necessário para FR-006 em qualquer deploy

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Set Vite `base` to `/ops-pilot/` for project Pages in `web/vite.config.ts` (per research: repo `ops-pilot`; optional env override for local `base: '/'` if documented)
- [ ] T004 Verify local artifact: run `npm ci` and `npm run build` in `web/` and confirm `web/dist/index.html` exists with asset paths under `/ops-pilot/`

**Checkpoint**: Build local produz SiteArtifact válido com base correta — stories de pipeline/docs podem seguir

---

## Phase 3: User Story 1 - Publicar a war room automaticamente (Priority: P1) 🎯 MVP

**Goal**: Push/`workflow_dispatch` na linha principal gera `web/dist`, faz upload-pages-artifact e publica no Pages.

**Independent Test**: Workflow verde → URL `https://claudemirbezerra.github.io/ops-pilot/` (ou `page_url`) serve a war room; jobs distintos build (artifact) e deploy.

### Implementation for User Story 1

- [ ] T005 [US1] Create `.github/workflows/deploy-pages.yml` with triggers `push` to branches `main` and `master`, plus `workflow_dispatch`, and `concurrency: { group: pages, cancel-in-progress: false }` per `contracts/pages-workflow.md`
- [ ] T006 [US1] In `.github/workflows/deploy-pages.yml`, set top-level `permissions`: `contents: read`, `pages: write`, `id-token: write` only (FR-003 / least privilege)
- [ ] T007 [US1] Add job `build` in `.github/workflows/deploy-pages.yml`: `ubuntu-latest`; `actions/checkout`; `actions/setup-node` with Node **22**; working directory `web/` — `npm ci` then `npm run build`; optional `actions/configure-pages`; `actions/upload-pages-artifact` with `path: web/dist` (no secrets / env API keys in build — FR-007)
- [ ] T008 [US1] Add job `deploy` in `.github/workflows/deploy-pages.yml`: `needs: build`; `environment.name: github-pages` with `url` from deployment step output; single step `actions/deploy-pages` with `id: deployment`
- [ ] T009 [US1] Smoke-check workflow YAML against `contracts/pages-workflow.md` (triggers, permissions, two jobs, artifact path, deploy-pages); note human prerequisite Settings → Pages → Source = GitHub Actions for first live deploy

**Checkpoint**: MVP — pipeline artifact → deploy definido; site publicável com Pages habilitado

---

## Phase 4: User Story 2 - Falha de build não publica site quebrado (Priority: P1)

**Goal**: Falha em gerar `web/` ⇒ `deploy` não corre; publicação anterior intacta.

**Independent Test**: Inspecionar YAML: `deploy.needs` = `build` e upload só após build sucesso; mentalmente/simulado: build red ⇒ deploy skipped.

### Implementation for User Story 2

- [ ] T010 [US2] Harden `.github/workflows/deploy-pages.yml`: confirm `deploy` has `needs: [build]` (or `needs: build`) and that `upload-pages-artifact` is **only** in `build` after successful `npm run build` (no unconditional deploy path, no parallel deploy without artifact)
- [ ] T011 [US2] Document the fail-closed rule in a short comment at the top of `.github/workflows/deploy-pages.yml` (build failure ⇒ no Pages promotion; previous site remains)

**Checkpoint**: Gate FR-004 explícito no workflow

---

## Phase 5: User Story 3 - Documentação do deploy no README (Priority: P2)

**Goal**: README na raiz explica publish automático, Source=Actions, URL e que a API não está no Pages.

**Independent Test**: Abrir `README.md` e achar seção Pages em &lt; 2 min per `contracts/readme-pages.md`.

### Implementation for User Story 3

- [ ] T012 [US3] Create or update root `README.md` with section **War Room / GitHub Pages** covering: auto-publish from `web/` via `.github/workflows/deploy-pages.yml`; prerequisite Settings → Pages → Source = **GitHub Actions**; public URL `https://claudemirbezerra.github.io/ops-pilot/` (or how to read it from Settings / `page_url`); triggers `main`/`master` + `workflow_dispatch` per `contracts/readme-pages.md`
- [ ] T013 [P] [US3] In root `README.md`, state explicitly that Pages does **not** host the OpsPilot API and that API base URL is configured in the war room gear (`localStorage`); link to `web/README.md` for local run

**Checkpoint**: FR-005 / SC-003 satisfeitos

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e alinhamento docs

- [ ] T014 [P] Add brief note in `web/README.md` pointing to root `README.md` for GitHub Pages URL / deploy (do not duplicate full Pages setup)
- [ ] T015 Run root `npm run typecheck` and `npm test`; run `npm --prefix web run typecheck` (or build) until green
- [ ] T016 Walk [quickstart.md](./quickstart.md) checklist items 1–3 locally; mark remote steps 4–5 as manual after first push with Pages Source=Actions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: After Foundational — MVP pipeline
- **User Story 2 (Phase 4)**: After US1 workflow exists (edits same YAML) — can be done in the same PR immediately after T008
- **User Story 3 (Phase 5)**: After Foundational; ideally after US1 so README can name the real workflow file — parallelizable with US2 (different file)
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **User Story 1 (P1)**: After Phase 2 — no dependency on US2/US3
- **User Story 2 (P1)**: Depends on US1 creating `.github/workflows/deploy-pages.yml` (same file)
- **User Story 3 (P2)**: Independent file (`README.md`); best after T005 so the workflow path is accurate

### Within Each User Story

- US1: triggers/concurrency → permissions → build job → deploy job → contract smoke
- US2: structural gate → comment
- US3: main Pages section → API note + link

### Parallel Opportunities

- T001 then T002 [P] in Setup
- After Phase 2: US3 can start in parallel with US1 if workflow filename is fixed in advance (`deploy-pages.yml`)
- T013 [P] after T012 within US3
- T014 [P] in Polish alongside typecheck if careful

---

## Parallel Example: User Story 1

```bash
# Sequential within US1 (same file deploy-pages.yml):
Task: "T005 Create workflow with triggers + concurrency"
Task: "T006 Set permissions"
Task: "T007 Add build job + upload-pages-artifact"
Task: "T008 Add deploy job + deploy-pages"
Task: "T009 Smoke-check against contracts/pages-workflow.md"
```

## Parallel Example: User Story 3

```bash
# After T012:
Task: "T013 [P] API-not-on-Pages note + link to web/README.md in README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Vite base + local build proof
3. Phase 3 Workflow build → artifact → deploy
4. **STOP and VALIDATE**: YAML matches contract; enable Pages Source=Actions; run workflow once
5. Then US2 harden + US3 README

### Incremental Delivery

1. Setup + Foundational → `web/dist` with correct base
2. US1 → first green Pages deploy (MVP)
3. US2 → fail-closed documented
4. US3 → contributors find URL in README
5. Polish → quickstart + typecheck/test green

### Parallel Team Strategy

1. Dev A: Phase 1–2 + US1 + US2 (YAML)
2. Dev B: US3 README (+ T014 web README) once workflow name agreed

---

## Notes

- [P] = different files, no incomplete-task dependency
- No formal TDD tasks — constitution V covered by local build + `needs: build` + root typecheck/test
- Do not commit secrets or bake API keys into `web/` build
- Human step outside tasks: Settings → Pages → Source = GitHub Actions
- Path-filter `web/**` is out of MVP (spec assumption)
