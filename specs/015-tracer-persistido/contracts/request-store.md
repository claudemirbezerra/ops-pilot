# Contract: RequestStore

Porta de persistência do tracer. Modelo: [data-model.md](../data-model.md).

## Interface

```ts
type SavedRequest = {
  requestId: string;
  createdAt: number;
  metrics: Record<string, unknown>; // Metrics do chat (+ historyMessages, contextBreakdown, …)
  trace: TraceEvent[];
};

type RequestStore = {
  save(input: {
    id: string;
    createdAt: number;
    metrics: SavedRequest["metrics"];
    trace: TraceEvent[];
  }): void;

  getById(id: string): SavedRequest | null;
};
```

Implementação: `SqliteRequestStore` (`node:sqlite` / `DatabaseSync`).

## Path

| Ambiente | Path |
|----------|------|
| Default | `process.env.OPSPILOT_DB ?? "./data/opspilot.db"` |
| Testes | `:memory:` |

Mesmo arquivo que conversas/ops/memória; conexão própria.

## `save`

1. Abre transação.
2. `INSERT` em `requests` (`id`, `created_at`, `metrics_json`).
3. Para cada evento em `trace` com índice `i`: `INSERT` em `trace_events` com `seq=i`, `type=event.type`, `node=event.node ?? null`, `payload=JSON.stringify(event)`.
4. Commit.

**Invariantes**:
- Mesmo `id` não deve ser salvo duas vezes no MVP (PK); testes usam UUID fresco.
- Trace vazio → só linha em `requests`.
- Payload é o evento completo; coluna `node`/`type` denormalizam para leitura/índice.

## `getById`

1. `SELECT` request por `id`. Ausente → `null` (borda traduz para `RequestNotFoundError` / 404).
2. `SELECT` eventos `WHERE request_id = ? ORDER BY seq ASC`.
3. Parse de cada `payload` → `TraceEvent[]` na ordem `seq`.
4. `metrics` = `JSON.parse(metrics_json)`.

## Fora de escopo

- Update/delete/retention TTL
- Compartilhar a mesma instância `DatabaseSync` com outros stores
- Persistência parcial de turnos que lançam erro de domínio
