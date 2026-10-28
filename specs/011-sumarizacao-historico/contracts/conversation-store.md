# Contract: ConversationStore (delta — resumos)

Delta sobre `specs/007-conversa-persistente/contracts/conversation-store.md`.

Modelo: [data-model.md](../data-model.md).

## Tipos

```ts
type ConversationMessage = { role: "user" | "assistant"; content: string };
type StoredMessage = ConversationMessage & { id: number };

type ConversationSummaryRecord = {
  text: string;
  coveredThroughId: number;
};

type ConversationStore = {
  create(): string;
  append(conversationId: string, message: ConversationMessage): void;
  lastMessages(conversationId: string, limit: number): ConversationMessage[];
  getSummary(conversationId: string): ConversationSummaryRecord | null;
  upsertSummary(
    conversationId: string,
    text: string,
    coveredThroughId: number,
  ): void;
  listUnsummarizedOutsideWindow(
    conversationId: string,
    windowSize: number,
    coveredThroughId: number,
  ): StoredMessage[];
};
```

## Comportamento novo

| Método | Regra |
|--------|--------|
| `getSummary` | `null` se não há linha; senão `{ text, coveredThroughId }`. Conversa inexistente → `ConversationNotFoundError`. |
| `upsertSummary` | Substitui o resumo da conversa (INSERT OU UPDATE). `text` com `trim` vazio → rejeição de domínio. Conversa inexistente → `ConversationNotFoundError`. |
| `listUnsummarizedOutsideWindow` | Mensagens com `id > coveredThroughId` que não estão no conjunto das `windowSize` mais recentes; ordem `id` ASC. Conversa vazia / sem pendentes → `[]`. |

## Persistência

- Tabela `conversation_summaries` no mesmo SQLite (`OPSPILOT_DB` / `:memory:`).
- DDL idempotente; não apaga `conversations` / `messages` / tabelas ops.

## Fora de escopo

- Listar ou apagar resumos via HTTP.
- Versionar resumos antigos.
