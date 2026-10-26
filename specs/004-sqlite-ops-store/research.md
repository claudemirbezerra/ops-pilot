# Research: Persistência Real de Operações

**Phase 0 output for** `specs/004-sqlite-ops-store/plan.md`

---

## Contexto

Hoje as tools usam `StoreHolder` + funções puras em `src/agents/store.ts`, com persistência opcional via `json-db` (`data/ops-store.json`). Bench/arena usam `createStoreFromPrimaryCatalog()` sem persistir. Ainda existem Sequelize/MySQL (`src/models`, `catalog-seed-service`) da constituição antiga. A constitution v2.0.0 manda SQLite via `node:sqlite` (`DatabaseSync`). Esta fase fecha a forma do `OpsStore`, o Mercadinho (slugs atuais + tier + runbooks), DDL/seed, e quem usa SQLite vs in-memory.

---

## Decisão 1: Runtime `node:sqlite` / `DatabaseSync`

**Decisão**: Usar `DatabaseSync` de `node:sqlite` (Node 22+; API sync). Path = `process.env.OPSPILOT_DB ?? "./data/opspilot.db"`. Se path ≠ `:memory:`, `mkdirSync(dirname(path), { recursive: true })` antes de abrir. Testes passam `":memory:"` no construtor.

**Rationale**: Atende FR-001/FR-002 e a constitution sem dependência npm extra. Sync API encaixa no fluxo atual das tools (mutação síncrona + observação).

**Alternatives considered**:
- `better-sqlite3` — bindings nativos; desnecessário com `node:sqlite`.
- Sequelize + dialect sqlite — contradiz constitution (“sem ORM externo”).
- Manter JSON/`json-db` — não atende CHECK, 4 tabelas, nem a stack obrigatória.

---

## Decisão 2: Contrato `OpsStore` (evolução do `Store` funcional)

**Decisão**: Introduzir interface `OpsStore` em `src/domain/types.ts` (ou `src/store/ops-store.ts` reexportado pelo domínio):

```typescript
type ServiceTier = "critical" | "high" | "standard";

interface OpsStore {
  seed(data: SeedPayload): void;
  listAlerts(status: AlertStatus | "all"): AlertRecord[];
  listIncidents(status: IncidentStatus | "all"): IncidentRecord[];
  openIncident(input: { title: string; service: string; severity: Severity }): IncidentRecord;
  resolveIncident(id: number, summary?: string | null): IncidentRecord;
  getRunbook(service: string): RunbookRecord;
}
```

- `SqliteOpsStore` e `InMemoryOpsStore` implementam `OpsStore`.
- Tools passam a receber `OpsStore` (em vez de mutar `StoreHolder.current` + `commitStore` JSON).
- IDs de incidente permanecem `number` (compatível com `resolver_incident` e testes atuais).
- Tool `list_incidents`: default `open` no Zod; `"all"` → `listIncidents("all")`.

**Rationale**: Spec pede `OpsStore`; superfície mínima para US2; remove o acoplamento a `json-db`. Números de incidente evitam reescrever contratos/testes de `001`.

**Alternatives considered**:
- Manter só funções puras + arquivo — não dá CHECK SQL nem `DatabaseSync` limpo.
- IDs string estilo `inc-<ts>` — breaking desnecessário neste repo.
- Métodos async — quebraria tools/bench sem ganho com `DatabaseSync`.

---

## Decisão 3: Nomes Mercadinho (preservar slugs atuais)

**Decisão**: Manter os 5 serviços do `primary-catalog.json`; apenas acrescentar `tier` e runbooks:

| slug | tier | runbook |
|------|------|---------|
| `checkout` | `critical` | sim |
| `payments` | `critical` | sim |
| `auth` | `high` | sim |
| `api-gateway` | `high` | não |
| `notifications` | `standard` | não |

Alertas: os 6 atuais (3 firing / 3 resolved) permanecem com os mesmos `serviceSlug` / títulos / severidades.

Runbooks: texto stub curto (checklist operacional); PK = `service` (= slug). Lookup exact match no slug.

**Rationale**: FR-006 pede 5 serviços + runbooks checkout/payments/auth. Renomear para catalog/inventory quebraria specs `001`–`003` e o catálogo versionado.

**Alternatives considered**:
- Remapear para catalog/inventory (projeto irmão) — rejeitado: drift com este repo.
- Só 3 serviços — viola “5 serviços” do Mercadinho.

---

## Decisão 4: DDL idempotente + CHECKs

**Decisão**: No construtor de `SqliteOpsStore`, `CREATE TABLE IF NOT EXISTS` para as 4 tabelas. CHECKs:

- `services.tier` ∈ (`critical`,`high`,`standard`)
- `alerts.severity` / `incidents.severity` ∈ (`critical`,`high`,`medium`,`low`)
- `alerts.status` ∈ (`firing`,`resolved`)
- `incidents.status` ∈ (`open`,`resolved`)

Colunas novas em incidents: `created_at` NOT NULL, `resolved_at` NULL, `summary` NULL. Timestamps como `INTEGER` (epoch ms).

Tabelas canônicas: `services`, `alerts`, `incidents`, `runbooks` (não `alertas` / `unbooks`).

**Rationale**: FR-003–FR-005; `IF NOT EXISTS` não apaga dados.

**Alternatives considered**:
- Migrações versionadas — fora de escopo.
- ENUM nativo SQLite — não existe; CHECK é o padrão.

---

## Decisão 5: Seed idempotente

**Decisão**: `seed(data)` usa `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` nas PKs:

- `services.slug`
- `alerts`: `UNIQUE(service_slug, title)` (domínio atual sem id de alerta)
- `runbooks.service`

Não apaga incidentes criados pelo usuário. Payload = catálogo primário estendido (tier + runbooks), validado com Zod.

**Rationale**: FR-006 / SC-002 — re-seed seguro.

**Alternatives considered**:
- Delete-all + insert — destrutivo.
- Seed só se tabela vazia — falha em DB parcial.

---

## Decisão 6: Prepared statements only

**Decisão**: Toda leitura/escrita via `db.prepare(sql).all/get/run(...)`. Filtros: statements separados ou `status = ?` bound — nunca interpolar input no SQL. Para `all`, statement sem cláusula de status.

**Rationale**: FR-007 / segurança por padrão.

---

## Decisão 7: Composição — quem usa SQLite vs in-memory

**Decisão**:

| Entrypoint | Store |
|------------|--------|
| HTTP / estratégias default (`react`, `plan-and-execute` sem holder) | `SqliteOpsStore` + seed |
| `npm run seed` | abre `OPSPILOT_DB` e aplica seed |
| `src/bench.ts` | `InMemoryOpsStore` + seed (FR-011 / SC-006) |
| `src/arena.ts` | `InMemoryOpsStore` + seed |
| Testes store/tools SQLite | `SqliteOpsStore(":memory:")` + seed |
| Testes que só precisam de catálogo estático | `InMemoryOpsStore` ok se não exercitam SQLite |

**Rationale**: Spec manda SQLite na produção e in-memory no bench; arena beneficia do mesmo isolamento.

**Alternatives considered**:
- Arena em SQLite arquivo — polui `data/` e acopla demos a I/O.

---

## Decisão 8: Tools e 6 regras

**Decisão**: Em `src/agents/tools.ts`:

1. Revisar `list_alertas`, `open_incident`, `resolver_incident` (dívida: quando usar / não usar; `.describe()`; enums).
2. Adicionar `list_incidents` e `consultar_runbook` com as mesmas 6 regras.
3. `createOpsTools(store: OpsStore)` retorna as 5 tools.
4. Manter nomes canônicos atuais (`list_alertas`, `resolver_incident`); novas tools em PT/EN como na spec (`list_incidents`, `consultar_runbook`).
5. `resolver_incident`: aceitar `summary` opcional alinhado a `resolveIncident(id, summary?)`.
6. Erros de domínio → observação (padrão atual).

**Rationale**: FR-008–FR-010.

---

## Decisão 9: Remoção MySQL / Sequelize / json-db de produção

**Decisão**: Nesta feature:

- Remover `mysql`, `mysql2`, `sequelize` (e `@types/sequelize`) do `package.json`.
- Descontinuar uso de `src/seed/json-db.ts` e `src/models` / `catalog-seed-service` na composição (apagar ou deixar de referenciar; preferir remover código morto se nenhum teste depender).
- `data/` no `.gitignore` (cobre `opspilot.db` e restos de `ops-store.json`).

**Rationale**: Stack obrigatória; evita duas fontes de verdade.

**Alternatives considered**: Deixar MySQL “por enquanto” — contradiz constitution e confunde `/seed`.

---

## Decisão 10: Testes CHECK

**Decisão**: `SqliteOpsStore` expõe `/** @internal */ readonly database: DatabaseSync` (ou getter de teste) para INSERT inválido de tier/severity/status. Não expor raw SQL nas tools.

**Rationale**: FR-013 / SC-004; `:memory:` isolado impede segundo `DatabaseSync` no mesmo DB.

---

## Resolução de NEEDS CLARIFICATION

Nenhum item do Technical Context ficou em aberto após as decisões (`tier` por slug, Mercadinho preservado, composição, forma do CHECK test, IDs numéricos).
