# Data Model: Persistência Real de Operações

**Phase 1 output for** `specs/004-sqlite-ops-store/plan.md`

Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/).

---

## Entities

### Service

| Field | Type | Constraints |
|-------|------|-------------|
| `slug` | `string` | PK; required; unique; padrão `[a-z0-9-]+` |
| `name` | `string` | Required |
| `description` | `string` | Required |
| `tier` | `ServiceTier` | Required; CHECK ∈ `critical` \| `high` \| `standard` |

**Seed (Mercadinho)**:

| slug | tier | runbook |
|------|------|---------|
| `checkout` | `critical` | sim |
| `payments` | `critical` | sim |
| `auth` | `high` | sim |
| `api-gateway` | `high` | não |
| `notifications` | `standard` | não |

---

### Alert

| Field | Type | Constraints |
|-------|------|-------------|
| `serviceSlug` / `service_slug` | `string` | Required |
| `title` | `string` | Required |
| `detail` | `string` | Required |
| `severity` | `Severity` | CHECK ∈ `critical` \| `high` \| `medium` \| `low` |
| `status` | `AlertStatus` | CHECK ∈ `firing` \| `resolved` |

**Unicidade seed**: `UNIQUE(service_slug, title)`.

**Seed**: 6 alertas do catálogo atual — 3 `firing`, 3 `resolved`.

---

### Incident

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `number` | PK; inteiro positivo (autoincrement / `nextIncidentId`) |
| `title` | `string` | Required |
| `serviceSlug` / `service_slug` | `string` | Required; deve existir no catálogo na abertura |
| `severity` | `Severity` | CHECK |
| `status` | `IncidentStatus` | CHECK ∈ `open` \| `resolved`; default `open` |
| `createdAt` / `created_at` | `number` | Epoch ms; NOT NULL |
| `resolvedAt` / `resolved_at` | `number \| null` | Epoch ms; NULL se aberto |
| `summary` | `string \| null` | NULL até resolução (ou se omitido) |

**State transitions**:

```text
open ──► resolved
```

`resolveIncident(id, summary?)` seta `status=resolved`, `resolved_at=now`, `summary=summary ?? null`. Já resolvido: permanece `resolved` (idempotente; confirma estado). Lança `UnknownIncidentError` se id ausente/inválido.

---

### Runbook

| Field | Type | Constraints |
|-------|------|-------------|
| `service` | `string` | PK (= slug do serviço) |
| `content` | `string` | Required; texto operacional |

**Seed**: runbooks para `checkout`, `payments`, `auth` apenas.

`getRunbook(service)` lança `RunbookNotFoundError` se não houver linha.

---

## Closed Domains (TypeScript + SQL CHECK)

| Domain | Values |
|--------|--------|
| `ServiceTier` | `critical`, `high`, `standard` |
| `Severity` | `critical`, `high`, `medium`, `low` |
| `AlertStatus` | `firing`, `resolved` |
| `IncidentStatus` | `open`, `resolved` |

---

## Relationships

```text
Service ──< Alert      (logical; service_slug string)
Service ──< Incident
Service ──1 Runbook    (optional; só checkout/payments/auth no seed)
```

Sem FK SQL obrigatória nesta fatia (research Decisão 3).

---

## OpsStore Contract (logical)

Ver [contracts/ops-store.md](./contracts/ops-store.md).

```typescript
interface SeedPayload {
  services: ServiceRecord[];
  alerts: AlertRecord[];
  runbooks: RunbookRecord[];
}

interface OpsStore {
  seed(data: SeedPayload): void;
  listAlerts(status: AlertStatus | "all"): AlertRecord[];
  listIncidents(status: IncidentStatus | "all"): IncidentRecord[];
  openIncident(input: {
    title: string;
    service: string;
    severity: Severity;
  }): IncidentRecord;
  resolveIncident(id: number, summary?: string | null): IncidentRecord;
  getRunbook(service: string): RunbookRecord;
}
```

---

## SQLite DDL (referencia)

```sql
CREATE TABLE IF NOT EXISTS services (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('critical', 'high', 'standard'))
);

CREATE TABLE IF NOT EXISTS alerts (
  service_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('firing', 'resolved')),
  PRIMARY KEY (service_slug, title)
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  service_slug TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS runbooks (
  service TEXT PRIMARY KEY,
  content TEXT NOT NULL
);
```

Mapeamento TS ↔ SQL: `serviceSlug` ↔ `service_slug`, `createdAt` ↔ `created_at`, `resolvedAt` ↔ `resolved_at`.

---

## Domain Errors

| Class | When |
|-------|------|
| `UnknownIncidentError` | `resolveIncident` / listagem com id desconhecido |
| `UnknownServiceError` | `openIncident` com slug fora do catálogo |
| `InvalidIncidentInputError` | título vazio / severidade inválida na API de domínio |
| `InvalidAlertStatusError` | filtro de alerta fora do domínio (se chamado fora do Zod) |
| `RunbookNotFoundError` | `getRunbook` sem linha para o serviço |

---

## Module Layout

```text
src/domain/types.ts              → ServiceRecord(+tier), Alert, Incident(+resolvedAt/summary), Runbook, OpsStore
src/domain/errors.ts             → + RunbookNotFoundError
src/store/sqlite-ops-store.ts    → SqliteOpsStore
src/store/in-memory-ops-store.ts → InMemoryOpsStore implements OpsStore
src/store/seed-mercadinho.ts     → load/validate payload; seedOpsStore(store)
src/seed/primary-catalog.json    → Mercadinho (+ tier + runbooks) OU seed-data dedicado
```
