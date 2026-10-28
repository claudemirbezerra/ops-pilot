# Data Model: Sumarização de histórico (pruning)

**Phase 1 output for** `specs/011-sumarizacao-historico/plan.md`

Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/). Pesquisa: [research.md](./research.md).

---

## Entities (novas / alteradas)

### ConversationSummary

Um resumo ativo por conversa. Persistido em `conversation_summaries`.

| Field | Type | Constraints |
|-------|------|-------------|
| `conversationId` / `conversation_id` | `string` | PK; FK → `conversations.id` |
| `summary` / `text` | `string` | NOT NULL; texto do resumo vigente (~150 tokens alvo) |
| `coveredThroughId` / `covered_through_id` | `number` | NOT NULL; maior `messages.id` já incorporado ao resumo |
| `updatedAt` / `updated_at` | `number` | Epoch ms; NOT NULL |

**Transições**:

| Evento | Efeito |
|--------|--------|
| Conversa criada | Sem linha de resumo |
| Lote de 8 egressos consolidado com sucesso | `UPSERT`: novo `summary`, `covered_through_id = batch[-1].id`, `updated_at` agora |
| Sumarizador falha / texto branco | Nenhuma escrita; linha anterior (se houver) intacta |
| Pedido vazio / 4xx / 504 | Nenhuma escrita |

Não há versionamento: consolidação substitui o texto.

---

### Message / Conversation (007 — inalterados em forma)

Mensagens continuam com `id` AUTOINCREMENT, `role`, `content`. O `id` passa a ser lido pelo store na listagem de egressos (tipo interno `StoredMessage = ConversationMessage & { id: number }`), sem expor `id` no HTTP.

---

## Janela do prompt (atualizada)

```text
prior = conversationId ? lastMessages(id, 8) : []
window = últimos 8 de [...prior, { role: "user", content: pedido }]
historyMessages = window.length   # 0..8
```

Bloco de resumo (se `getSummary()?.text` não vazio) **não** conta em `historyMessages`.

---

## Egressos e lote

Definições (pós-append de um turno 200):

```text
covered = getSummary(id)?.coveredThroughId ?? 0
pending = mensagens com id > covered que NÃO estão entre as 8 mais recentes
          ordenadas por id ASC
```

| Condição | Ação |
|----------|------|
| `pending.length < 8` | Sem consolidação |
| `pending.length >= 8` | `batch = pending[0..7]`; sumarizar; `covered_through_id = batch[7].id` |

Primeira consolidação típica: ≥ 16 mensagens gravadas (8 fora + 8 na janela), todas com `id > 0`.

---

## Composição do contexto (por turno)

Não é tabela. Ordem do texto entregue à estratégia:

1. Bloco de memória (008), se houver
2. Bloco de resumo (`Resumo da conversa:\n…`), se houver texto
3. Histórico bruto (`Plantonista:` / `Copiloto:`), janela ≤ 8

---

## Relationships

```text
Conversation ──< Message
Conversation ── 0..1 ConversationSummary
```

Resumo de uma conversa nunca entra no contexto de outra.

---

## Validation rules

- `upsertSummary`: conversa deve existir; `summary` após `trim` não vazio; `coveredThroughId` inteiro ≥ 1 (id de mensagem real do lote).
- `listUnsummarizedOutsideWindow`: `windowSize` inteiro ≥ 1 (canal usa 8); conversa inexistente → erro de domínio.
- HTTP: sem campos novos no request; `trace` pode ganhar evento `summarize`; `contextBreakdown.summary` na resposta.

---

## Schema (referência)

```sql
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
  summary TEXT NOT NULL,
  covered_through_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

DDL idempotente no construtor de `SqliteConversationStore`. Prepared statements. `PRAGMA foreign_keys = ON` já existente.
