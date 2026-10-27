# Contract: MemoryStore

Guarda de fatos semânticos por `userId`. Implementação: `SqliteMemoryStore` em `src/memory/memory-store.ts`. Embeddings: [embeddings.md](./embeddings.md) (lazy singleton). Modelo de dados: [data-model.md](../data-model.md).

## Interface

```ts
type MemoryRecord = {
  id: string;
  userId: string;
  fact: string;
  createdAt: number;
};

type RecalledMemory = MemoryRecord & { score: number };

type MemoryStore = {
  remember(userId: string, fact: string): Promise<MemoryRecord>;
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
  forget(userId: string, memoryId: string): void;
};
```

Construtor sugerido: `new SqliteMemoryStore(path?, embedder?)`  
`path` default `process.env.OPSPILOT_DB ?? "./data/opspilot.db"`.  
`embedder` default = singleton de `src/memory/embeddings.ts`.

## remember(userId, fact)

1. Se `userId.trim()` ou `fact.trim()` vazios → `InvalidMemoryInputError`.
2. `vector = await embedder.embed(fact)`.
3. Carrega embeddings existentes desse `userId`. Se algum `dot(vector, existing) > 0.92`, **não** insere; devolve o `MemoryRecord` já existente (o de maior score; empate: mais antigo).
4. Senão: gera `id` UUID, `created_at = Date.now()`, INSERT, devolve o novo registro.

Não altera fatos de outros usuários.

## recall(userId, query)

1. Se `userId.trim()` ou `query.trim()` vazios → `InvalidMemoryInputError`.
2. `q = await embedder.embed(query)`.
3. Para cada fato do `userId`, `score = dot(q, embedding)`.
4. Filtra `score >= 0.3`.
5. Ordena: score DESC, `created_at` ASC, `id` ASC.
6. Devolve no máximo 3 itens como `RecalledMemory` (sem expor o BLOB).

Lista vazia é sucesso (`[]`), não erro.

## forget(userId, memoryId)

1. Se ids em branco → `InvalidMemoryInputError`.
2. `DELETE FROM memories WHERE id = ? AND user_id = ?`.
3. Se `changes === 0` → `MemoryNotFoundError`.
4. Senão: sucesso silencioso (void).

Não apaga fatos de outro `userId` mesmo que o `id` exista.

## Persistência

- Tabela `memories` — ver [data-model.md](../data-model.md).
- Testes: `path = ":memory:"`.
- Open idempotente; não DROP; não toca outras tabelas.
- Prepared statements; sem SQL concatenado com entrada.

## Erros de domínio

| Classe | Quando |
|--------|--------|
| `InvalidMemoryInputError` | texto em branco / parâmetros inválidos |
| `MemoryNotFoundError` | *forget* sem linha no escopo |
| `EmbeddingUnavailableError` | falha ao carregar ou inferir o modelo |

## Fora deste contrato

- Endpoints HTTP de CRUD de memória
- Integração com tools MCP / LangChain
- Listagem paginada administrativa
