# Contract: ConversationStore

**Phase 1 output for** `specs/007-conversa-persistente/plan.md`

Implementação: `SqliteConversationStore` em `src/store/sqlite-conversation-store.ts`. Tipos em `src/domain/types.ts`. Não há segunda implementação em memória.

Campos em [data-model.md](../data-model.md).

---

## Constructor

| Input | Behavior |
|-------|----------|
| `path?: string` | Default `process.env.OPSPILOT_DB ?? "./data/opspilot.db"` |
| `":memory:"` | Banco efêmero (testes) |
| path em arquivo | `mkdirSync` no diretório pai; abre `DatabaseSync` |

No construct: pragmas (`foreign_keys`, `busy_timeout`), DDL idempotente de `conversations` e `messages`, prepared statements cacheados. Reabrir o mesmo arquivo não apaga mensagens nem tabelas operacionais.

`readonly database` fica exposto no mesmo espírito do `SqliteOpsStore`, para o teste de CHECK.

---

## Types

```text
ConversationRole = "user" | "assistant"

ConversationMessage = { role: ConversationRole; content: string }

ConversationStore = {
  create(): string
  append(conversationId: string, message: ConversationMessage): void
  lastMessages(conversationId: string, limit: number): ConversationMessage[]
}
```

---

## Methods

### `create(): string`

- Insere uma conversa vazia.
- Devolve o UUID.
- Duas chamadas devolvem ids diferentes.

### `append(conversationId, message): void`

- Conversa ausente → `ConversationNotFoundError` (`Conversa desconhecida: <id>.`). Nada é inserido.
- `content` vazio ou só espaços, ou `role` fora de `user` \| `assistant` → `InvalidConversationMessageError`. Nada é inserido.
- Caso válido: uma linha, `created_at = Date.now()`, `content` gravado como recebido (sem trim).

### `lastMessages(conversationId, limit): ConversationMessage[]`

- Conversa ausente → `ConversationNotFoundError`.
- `limit` que não é inteiro ≥ 1 → `InvalidConversationMessageError`.
- Conversa vazia → `[]`.
- Devolve no máximo `limit` mensagens, as mais recentes, da mais antiga para a mais nova.
- Cada item é só `{ role, content }`.
- Não inclui mensagens de outra conversa.

---

## Invariants

- Nenhuma query concatena valor de entrada.
- `CHECK` de `role` rejeita valor fora do domínio mesmo se o teste escrever SQL direto em `database`.
- Falha de FK não substitui o erro de domínio: a API consulta a conversa antes do `INSERT`.
