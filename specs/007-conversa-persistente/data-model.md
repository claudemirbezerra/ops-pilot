# Data Model: Conversa persistente

**Phase 1 output for** `specs/007-conversa-persistente/plan.md`

Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/).

---

## Entities

### Conversation

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `string` | PK; `crypto.randomUUID()`; texto estável devolvido como `conversationId` |
| `createdAt` / `created_at` | `number` | Epoch ms; NOT NULL; não vai no prompt nem no HTTP |

Nasce vazia em `create()`. Não tem título, dono nem status. Não há transição de estado: o fio só acumula mensagens.

Não há API para listar ou apagar conversas.

---

### Message

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `number` | PK; `INTEGER PRIMARY KEY AUTOINCREMENT`; ordena a conversa; não sai na API |
| `conversationId` / `conversation_id` | `string` | NOT NULL; FK → `conversations.id` |
| `role` | `ConversationRole` | CHECK ∈ `user` \| `assistant` |
| `content` | `string` | NOT NULL; texto não branco (`trim` vazio é rejeitado na API) |
| `createdAt` / `created_at` | `number` | Epoch ms; NOT NULL; desempate de leitura é `id`, não o relógio |

**O que cada turno 200 grava**, nesta ordem:

1. `user` — texto cru do pedido (não o prompt composto, não o trim)
2. `assistant` — `answer` da estratégia (não o `trace`)

Pedido vazio, 400, 422, 404 e 504 não inserem linha e não criam conversa.

---

## Closed Domains (TypeScript + SQL CHECK)

| Domain | Values | Rótulo no prompt |
|--------|--------|------------------|
| `ConversationRole` | `user`, `assistant` | `Plantonista`, `Copiloto` |

Qualquer outro falante é rejeitado na API (`InvalidConversationMessageError`) e, se o `INSERT` for tentado por fora, pelo CHECK.

---

## Relationships

```text
Conversation ──< Message
```

Mensagens de uma conversa não aparecem em `lastMessages` nem no prompt de outra.

O arquivo SQLite é o mesmo das tabelas operacionais (`services`, `alerts`, `incidents`, `runbooks`). Não há FK entre mensagem e incidente. Criar as tabelas de conversa não altera as operacionais.

---

## Janela do prompt

Não é tabela. É a lista calculada por turno:

```text
prior = conversationId ? lastMessages(id, 12) : []
window = últimos 12 de [...prior, { role: "user", content: pedido }]
historyMessages = window.length
```

| Já gravadas antes do turno | `historyMessages` | Quem fica de fora do prompt |
|----------------------------|-------------------|-----------------------------|
| 0 | 1 | ninguém |
| 2 (um turno completo) | 3 | ninguém |
| 12 ou mais | 12 | a mais antiga entre as candidatas; o resto continua gravado |

A resposta deste turno não entra na janela. Entra no turno seguinte, como `assistant`.

Pedido vazio: não há janela; `historyMessages` é 0.

---

## Validation rules

- HTTP: `conversationId` omitido cria conversa só no 200 executado. Presente, tem de ser texto não vazio depois de `trim`. Não se exige formato UUID.
- Store: `append` e `lastMessages` exigem conversa existente.
- Store: `limit` de `lastMessages` é inteiro ≥ 1. O canal sempre pede 12.
- Store: `content` com `trim` vazio não é gravado.
- Dois 200 seguidos no mesmo fio deixam quatro mensagens: user, assistant, user, assistant.

---

## Schema (referência)

DDL idempotente no construtor. Prepared statements em toda leitura e escrita. Sem concatenar entrada no SQL.

```text
conversations
  id          TEXT PRIMARY KEY
  created_at  INTEGER NOT NULL

messages
  id               INTEGER PRIMARY KEY AUTOINCREMENT
  conversation_id  TEXT NOT NULL REFERENCES conversations(id)
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant'))
  content          TEXT NOT NULL
  created_at       INTEGER NOT NULL

INDEX messages_conversation_id_id (conversation_id, id)
```

`PRAGMA foreign_keys = ON` e `PRAGMA busy_timeout = 5000` na conexão do guarda de conversa.
