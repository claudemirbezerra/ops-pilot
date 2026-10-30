# Research: Tracer persistido e logs JSON

**Phase 0 output for** `specs/015-tracer-persistido/plan.md`

---

## Contexto

Hoje `POST /chat` devolve `answer`, `trace` e `metrics` só na resposta HTTP. Não há `requestId`, header de correlação, tabela de execução nem logger JSON estruturado. Persistência SQLite já existe em stores separados no mesmo `OPSPILOT_DB` (`SqliteOpsStore`, `SqliteConversationStore`, `SqliteMemoryStore`), cada um com seu `DatabaseSync` + `CREATE TABLE IF NOT EXISTS`.

A spec pede: `requestId` no corpo + `X-Request-Id`; tabelas lógicas request/métricas e trace_events; `src/obs/logger.ts` (1 linha JSON / evento, só metadados); `GET /request/:id`.

---

## Decisão 1: Store dedicado `SqliteRequestStore` (não estender OpsStore)

**Decisão**: Criar `src/store/sqlite-request-store.ts` com interface `RequestStore` (save + getById), path default `process.env.OPSPILOT_DB ?? "./data/opspilot.db"`, testes `:memory:`.

**Rationale**: `OpsStore` é contrato de domínio operacional (alertas/incidentes/runbooks). Misturar tracer acoplaria tools/MCP a observabilidade HTTP. O padrão conversa/memória já prova stores separados no mesmo arquivo SQLite.

**Alternatives considered**:
- Colunas em `SqliteOpsStore` — polui interface usada por tools/MCP/arena.
- Só arquivo de log sem SQLite — quebra FR de consulta ordenada e sobrevivência a reinício.
- Um único `DatabaseSync` compartilhado injetado globalmente — churn grande; fora do padrão atual.

---

## Decisão 2: Nomes de tabela `requests` + `trace_events`

**Decisão**: Tabela pai `requests` (plural, alinhado a `conversations` / `messages`); filha `trace_events`. O enunciado “request” lê-se como entidade lógica; SQL usa plural consistente.

**Rationale**: Evita palavra reservada ambígua e segue convenção do repo. FK `trace_events.request_id → requests.id`.

**Alternatives considered**:
- Tabela literal `request` — válido no SQLite, mas inconsistente com o resto do schema do projeto.
- Só `trace_events` com métricas denormalizadas em cada linha — duplica métricas e complica GET do registro.

---

## Decisão 3: `requestId` = `randomUUID()` no início do handler `/chat`

**Decisão**: Gerar com `crypto.randomUUID()` **antes** de `runChat` / validação de estratégia que possa falhar após o parse do body. Setar `res.setHeader("X-Request-Id", id)` cedo. Incluir `requestId` no JSON 200. Em erros de domínio após o id existir, manter o header (e `requestId` no corpo de erro só se o contrato de erro já for objeto simples — preferir **header sempre**; corpo de erro permanece `{ message }` / `{ issues }` como hoje, sem obrigar campo novo).

**Rationale**: Spec assume geração no servidor; UUID é estável, único e já usado em conversas. Header cedo cobre 4xx/504/503 pós-atribuição.

**Alternatives considered**:
- Id só após sucesso — quebra correlação em falhas (FR-002).
- Aceitar id do cliente — fora de escopo (Assumption da spec).
- ULID/nanoid — dep nova sem ganho.

---

## Decisão 4: Persistir **antes** do `res.status(200).json(...)`

**Decisão**: Após `runChat` bem-sucedido, `requestStore.save({ id, metrics, trace, ... })` e só então responder 200. Em falha de domínio (throw), best-effort: se houver algo útil para gravar (ex. futuro), opcional; MVP grava só caminho de sucesso completo (métricas + trace do resultado). Pedido em branco (200 orientativo) **também** grava request (métricas zeradas / trace mínimo).

**Rationale**: Spec prefere persistir antes do 200 quando viável; evita corrida em que GET imediato 404 após 200.

**Alternatives considered**:
- Fire-and-forget após response — GET flaky nos testes e no plantão.
- Gravar também todos os 4xx/5xx — útil, mas escopo extra; edge case da spec já admite GET 404 se falhou antes da gravação.

---

## Decisão 5: Payload completo no SQLite; metadados no log

**Decisão**:
- `trace_events.payload` = JSON string do `TraceEvent` completo (inclui `content` / `args` / etc.).
- `trace_events.node` = `event.node ?? null` (coluna dedicada para índice/filtro; também pode estar dentro do JSON).
- `trace_events.seq` = inteiro 0..n-1 na ordem do array `trace` do turno.
- Logger: `{ requestId, seq, type, node?, ts }` — **sem** `content`, `args`, `steps`, `payload`.

**Rationale**: Cumpre FR-004 (payload persistido) e FR-005 (log só metadados). Testável: parse da linha não tem chaves de payload.

**Alternatives considered**:
- Log com payload truncado — ainda vaza dados e foge do “só metadados”.
- Persistência sem coluna `node` (só JSON) — dificulta queries; spec pediu nó explícito.

---

## Decisão 6: Logger com writer injetável em `src/obs/logger.ts`

**Decisão**: Função/módulo que recebe evento de metadados e escreve `JSON.stringify(meta) + "\n"` via writer default `process.stdout.write` (ou stderr — **stdout** como default de telemetria linha). Em testes, injetar array/collector.

Emitir **uma linha por evento de trace** no save/wire. Linha opcional de ciclo de vida (`type: "request_start" | "request_end"`) permitida pela spec — MVP inclui `request_end` com `{ requestId, event: "request_end", status: "ok"|"error", ts }` **sem** payload; não emitir linhas inventadas de trace se `trace.length === 0` (além da linha de ciclo de vida, se houver).

**Rationale**: Spec nomeia o path; injeção evita acoplar testes a stdout real.

**Alternatives considered**:
- Dependência `pino`/`winston` — dep nova, overkill.
- Só `console.log` sem abstração — difícil assertar sem mock global frágil.

---

## Decisão 7: `GET /request/:id` + `RequestNotFoundError`

**Decisão**: Rota no mesmo `createApp`. Validar `:id` trim não vazio (400 se vazio/ausente). `store.getById(id)` → `null` lança / mapeia `RequestNotFoundError` → HTTP 404 `{ message }`. 200:

```json
{
  "requestId": "...",
  "createdAt": 0,
  "metrics": { ... },
  "trace": [ /* TraceEvent na ordem seq */ ]
}
```

`trace` reconstruído a partir de `payload` JSON parseado, ordenado por `seq ASC`.

**Rationale**: Espelha `ConversationNotFoundError`. Mantém formato familiar ao `trace` do `/chat`.

**Alternatives considered**:
- 200 com `trace: []` para id desconhecido — mascara ausência (quebra FR-007).
- Devolver linhas cruas do DB sem parse — contrato menos estável para o cliente.

---

## Decisão 8: Métricas como JSON na linha `requests`

**Decisão**: Coluna `metrics_json TEXT NOT NULL` com o objeto de métricas do 200 (inclui `historyMessages`, `contextBreakdown`, etc. quando presentes). Colunas escalares opcionais (`latency_ms`, `llm_calls`) **não** são obrigatórias no MVP se o JSON já cobre SC-003; pode-se indexar depois.

Também: `created_at INTEGER NOT NULL` (epoch ms), `id TEXT PRIMARY KEY`.

**Rationale**: Métricas do chat já evoluem (modelUsed, breakdown); JSON evita migração a cada campo novo.

**Alternatives considered**:
- Coluna por campo de métrica — frágil com extensões 010/014.
- Normalizar metrics em tabela filha — overkill.

---

## Decisão 9: Onde wirear (HTTP + store), não dentro das estratégias

**Decisão**: Estratégias/grafo **não** conhecem `RequestStore` nem logger. `server.ts` (e helpers mínimos) após `runChat`: loga metadados de cada evento, `save`, responde. Injeta `requestStore` / `logger` via `CreateAppOptions` para testes (default: SQLite file + stdout).

**Rationale**: Constituição I; arena/bench não precisam persistir (Assumption).

**Alternatives considered**:
- Instrumentar cada nó LangGraph — escopo maior e duplica o `trace` já agregado.
- Middleware Express genérico sem acesso ao resultado do chat — não vê metrics/trace.

---

## Resolução de ambiguidades

| Tópico | Resolução |
|--------|-----------|
| Header `X-Request_Id` | `X-Request-Id` |
| Tabela `request` vs `requests` | `requests` |
| Persistência em erro | MVP: sucesso (incl. blank 200); header de correlação em erros |
| Auth GET | Nenhuma extra |
| Deps novas | Nenhuma |

**Nenhum NEEDS CLARIFICATION restante.**
