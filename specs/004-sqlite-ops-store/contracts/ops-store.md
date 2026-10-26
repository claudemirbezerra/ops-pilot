# Contract: OpsStore

**Phase 1 output for** `specs/004-sqlite-ops-store/plan.md`

Implementações: `SqliteOpsStore`, `InMemoryOpsStore`.

---

## Constructor / config (`SqliteOpsStore`)

| Input | Behavior |
|-------|----------|
| `path?: string` | Default `process.env.OPSPILOT_DB ?? "./data/opspilot.db"` |
| `":memory:"` | DB efêmero (testes) |
| path em arquivo | `mkdirSync` no diretório pai se necessário; abre `DatabaseSync` |

No construct: DDL idempotente (4 tabelas). Prepared statements cacheados como campos privados.

---

## Methods

### `seed(data: SeedPayload): void`

- Valida shape (chamador / `seed-mercadinho` com Zod) antes.
- Insere services, alerts, runbooks com `INSERT OR IGNORE` / equivalente in-memory (skip se PK existe).
- Não remove incidentes existentes.
- Idempotente: segunda chamada não duplica PKs.

### `listAlerts(status: AlertStatus | "all"): AlertRecord[]`

- `"all"`: todos.
- `firing` / `resolved`: filtra.
- Retorna cópias / rows mapeadas (sem compartilhar mutação interna).

### `listIncidents(status: IncidentStatus | "all"): IncidentRecord[]`

- `"all"`: todos.
- `open` / `resolved`: filtra.
- Ordenação sugerida: `id ASC` (estável; bate com IDs numéricos sequenciais).

### `openIncident({ title, service, severity }): IncidentRecord`

- Valida título não vazio e serviço existente → senão erro de domínio.
- Gera `id` numérico, `status="open"`, `createdAt=Date.now()`, `resolvedAt=null`, `summary=null`.
- Persistência imediata (SQLite `INSERT`).

### `resolveIncident(id, summary?): IncidentRecord`

- Se id inválido/ausente → `UnknownIncidentError`.
- Se já `resolved`: confirma estado (idempotente).
- Se `open`: seta `resolved`, `resolvedAt=now`, `summary=summary ?? null`.

### `getRunbook(service): RunbookRecord`

- Se não existe → `RunbookNotFoundError`.
- Retorna `{ service, content }`.

---

## Invariants

- Nenhuma query com concatenação de valores de input.
- Domínios fechados rejeitados no SQL (CHECK) mesmo se a API de domínio for contornada nos testes internos.
- `InMemoryOpsStore` espelha a mesma semântica (sem CHECK SQL; valida no seed/abertura).
- Serviço referenciado por **slug** (`checkout`, `payments`, …), não pelo nome de exibição.
