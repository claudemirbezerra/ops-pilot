# Data Model: Memória semântica

**Phase 1 output for** `specs/008-memoria-semantica/plan.md`

Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/).

---

## Entities

### Memory (fato)

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `string` | PK; `crypto.randomUUID()`; TEXT |
| `userId` / `user_id` | `string` | NOT NULL; escopo de isolamento; índice |
| `fact` | `string` | NOT NULL; texto não branco (`trim` vazio rejeitado na API) |
| `embedding` | `Float32Array` → BLOB | NOT NULL; 384 floats LE (1536 bytes); não sai no HTTP |
| `createdAt` / `created_at` | `number` | Epoch ms; NOT NULL; desempate no recall |

Não há status, título nem expiração. Ciclo: nasce no *remember* → some no *forget*.

---

## Tabela SQL

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories (user_id);
```

- DDL idempotente no open do `SqliteMemoryStore`.
- Mesmo arquivo que ops + conversas (`OPSPILOT_DB`).
- Sem FK para `conversations` / `messages` / `services`.

---

## Domínio TypeScript

```ts
type MemoryRecord = {
  id: string;
  userId: string;
  fact: string;
  createdAt: number;
};

type RecalledMemory = MemoryRecord & { score: number };

type Embedder = {
  embed(text: string): Promise<Float32Array>;
};

type MemoryStore = {
  remember(userId: string, fact: string): Promise<MemoryRecord>;
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
  forget(userId: string, memoryId: string): void;
};
```

`embedding` não faz parte de `MemoryRecord` exposto ao service/HTTP — só o store o usa para scoring.

---

## Constantes de similaridade

| Nome | Valor | Regra |
|------|-------|--------|
| `DEDUP_THRESHOLD` | `0.92` | *remember*: se existe fato do mesmo `userId` com `dot > 0.92`, não inserir; devolver o existente |
| `RECALL_MIN_SCORE` | `0.3` | *recall*: excluir `score < 0.3` |
| `RECALL_TOP_K` | `3` | *recall*: no máximo 3 resultados |
| Dimensão | `384` | all-MiniLM-L6-v2 / Xenova |

Pontuação = produto interno de vetores L2-normalizados.

**Ordem de recall**: `score` DESC, depois `created_at` ASC, depois `id` ASC.

---

## Relationships

```text
userId (texto opaco) ──< Memory
```

- Não há entidade `User` persistida.
- Fatos de um `userId` não entram no *recall* / dedup / *forget* de outro.
- Independente de `Conversation` / `Message` (um plantonista pode ter vários fios e uma única memória).

O arquivo SQLite é o mesmo das tabelas operacionais e de conversa. Criar `memories` não as altera.

---

## Bloco de memória no prompt

Não é tabela. Calculado por turno quando `userId` está presente:

```text
recalled = recall(userId, message)   // ≤ 3, score ≥ 0.3
memoryBlock = renderMemoryPrompt(recalled)
history = renderHistoryPrompt(window)
prompt = memoryBlock ? memoryBlock + "\n\n" + history : history
```

Formato do bloco:

```text
Memória do plantonista:
- <fact>
- <fact>
```

Lista vazia → sem bloco (prompt = só histórico).

---

## Validation Rules

| Campo / operação | Regra | Erro |
|------------------|-------|------|
| `userId` / `fact` em *remember* | `trim` não vazio | `InvalidMemoryInputError` |
| `userId` / `memoryId` em *forget* | registro com ambos | senão `MemoryNotFoundError` |
| `userId` no HTTP | omitido OK; presente após trim `min(1)` | senão 400 `issues` |
| Embed / modelo | falha de carga ou inferência | `EmbeddingUnavailableError` |
| Dedup | `dot > 0.92` mesmo `userId` | sem insert |

---

## Fora do modelo desta feature

- Listagem HTTP de memórias, *remember*/*forget* via `/chat` ou tools do agente
- Retenção / TTL
- Arena / bench com `userId`
- Autenticação que prove a posse do `userId`
