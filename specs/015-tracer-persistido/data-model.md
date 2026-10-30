# Data Model: Tracer persistido e logs JSON

**Feature**: `015-tracer-persistido`  
**Persistência**: SQLite (`OPSPILOT_DB` / `:memory:`), tabelas `requests` e `trace_events`.  
Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/).

---

## RequestRecord

Registro de uma execução de `POST /chat`.

| Campo (domínio) | Coluna SQL | Tipo | Constraints |
|-----------------|------------|------|-------------|
| `id` / `requestId` | `id` | `string` | PK; UUID (`randomUUID()`); NOT NULL |
| `createdAt` | `created_at` | `number` | Epoch ms; NOT NULL |
| `metrics` | `metrics_json` | object → TEXT JSON | NOT NULL; objeto de métricas do turno |

**Validação**:
- `id` trim não vazio.
- `metrics` serializável em JSON (objeto; pode ser métricas zeradas em pedido em branco).

**Ciclo de vida**:
1. Criado no fim bem-sucedido do turno (inclui 200 de pedido em branco), **antes** da resposta HTTP.
2. Imutável no MVP (sem update de métricas pós-gravação).
3. Ausência → `RequestNotFoundError` na consulta.

---

## TraceEventRecord

Um evento do array `trace` do turno, persistido para reconstrução.

| Campo (domínio) | Coluna SQL | Tipo | Constraints |
|-----------------|------------|------|-------------|
| `id` | `id` | `number` | PK INTEGER AUTOINCREMENT |
| `requestId` | `request_id` | `string` | NOT NULL; FK → `requests(id)` |
| `seq` | `seq` | `number` | NOT NULL; inteiro ≥ 0; ordem no array do turno |
| `node` | `node` | `string \| null` | `TraceNode` quando presente no evento; senão NULL |
| `type` | `type` | `string` | NOT NULL; discriminador do `TraceEvent` (`thought`, `action`, …) |
| `payload` | `payload` | object → TEXT JSON | NOT NULL; `TraceEvent` completo |

**Unicidade**: `UNIQUE(request_id, seq)`.

**Ordenação na leitura**: `ORDER BY seq ASC`.

**Relação**: N eventos pertencem a 1 request. Request sem eventos (trace vazio) é válido.

---

## SQL (referência)

```sql
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  metrics_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id),
  seq INTEGER NOT NULL,
  node TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (request_id, seq)
);

CREATE INDEX IF NOT EXISTS trace_events_request_id_seq
  ON trace_events (request_id, seq);
```

`PRAGMA foreign_keys = ON` no open do store (padrão conversa).

---

## LogMetadata (não persistido em tabela)

Linha JSON emitida pelo logger — **não** é entidade SQLite.

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `requestId` | `string` | sim | Correlação |
| `seq` | `number` | sim* | Índice do evento no trace (*ausente em linhas de ciclo de vida) |
| `type` | `string` | sim | Tipo do TraceEvent **ou** `request_end` / `request_start` |
| `node` | `string` | não | Só se conhecido |
| `ts` | `number` | sim | Epoch ms |
| `event` | `string` | não | Ciclo de vida: `request_start` \| `request_end` |
| `status` | `string` | não | Ex.: `ok` no fim bem-sucedido |

**Proibido no log**: `content`, `args`, `steps`, `payload`, ou qualquer cópia integral do TraceEvent.

---

## RequestNotFoundError

Erro de domínio (não persistido).

| Campo | Valor |
|-------|--------|
| `name` | `RequestNotFoundError` |
| `message` | Mensagem estável (ex.: `Request não encontrado.`) |

Borda HTTP: **404** `{ message }`.

---

## RequestStore (porta)

| Operação | Entrada | Saída / efeito |
|----------|---------|----------------|
| `save(record)` | `id`, `createdAt`, `metrics`, `trace: TraceEvent[]` | Upsert/insert request + insert eventos `seq=0..n-1` numa transação |
| `getById(id)` | `string` | `{ requestId, createdAt, metrics, trace }` ou `null` |

Implementação: `SqliteRequestStore`. Default path `OPSPILOT_DB`.

---

## Extensões HTTP (visão de dados)

### ChatResult / 200 `/chat`

Campo novo no JSON: `requestId: string` (mesmo valor do header `X-Request-Id`).

`answer`, `trace`, `metrics`, `conversationId?` inalterados na semântica.

### GET `/request/:id` 200

```text
{ requestId, createdAt, metrics, trace }
```

`trace` = lista de `TraceEvent` na ordem `seq` (parse de `payload`).

---

## Relationships

```text
requests 1 ──< N trace_events
HTTP /chat ── gera → RequestRecord (+ events)
HTTP GET /request/:id ── lê → RequestRecord + events ordenados
Logger ── emite → LogMetadata (stdout), 1:1 com evento de trace (+ opcional ciclo de vida)
```
