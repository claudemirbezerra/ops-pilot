# Quickstart: Conversa persistente

**Phase 1 output for** `specs/007-conversa-persistente/plan.md`

Guia de validação. Sem código de implementação completo.

Referências: [data-model.md](./data-model.md), [contracts/conversation-store.md](./contracts/conversation-store.md), [contracts/chat-http.md](./contracts/chat-http.md).

---

## Pré-requisitos

- Node.js 22+
- `npm install` na raiz
- Nenhum pacote novo
- A app não lê `.env`. `OPSPILOT_DB` só vale se o processo já recebeu a variável

---

## 1. Validação automatizada — obrigatória

```bash
npm test
npm run typecheck
```

**Esperado**: verdes, incluindo os testes novos em `:memory:` e sem rede.

| # | Onde | Caso | Esperado |
|---|------|------|----------|
| 1 | store | `create` | id estável, `lastMessages` vazio |
| 2 | store | `append` + `lastMessages(limit)` | no máximo `limit`, as mais recentes, ordem cronológica |
| 3 | store | duas conversas | leitura isolada |
| 4 | store | id ausente, texto branco, role inválida | erro de domínio; CHECK no SQL direto |
| 5 | prompt puro | 0, 2 e 12 mensagens prévias | janela 1, 3 e 12; a mais antiga sai quando já havia 12; rótulos Plantonista/Copiloto |
| 6 | `POST /chat` | sem `conversationId` | 200, id novo, substituto recebe `Plantonista: <mensagem>`, `historyMessages` 1 |
| 7 | `POST /chat` | segundo POST com o id | mesmo id, prompt com o turno anterior e o pedido novo, `historyMessages` 3, quatro linhas no store |
| 8 | `POST /chat` | mais de 12 já gravadas | prompt com 12, `historyMessages` 12, a mais antiga ausente do texto e presente no store |
| 9 | `POST /chat` | id desconhecido | 404, substituto não roda, nada gravado |
| 10 | `POST /chat` | estratégia desconhecida e id desconhecido | 422, não 404 |
| 11 | `POST /chat` | `conversationId` número, vazio ou só espaços | 400 |
| 12 | `POST /chat` | mensagem só espaços, com e sem id | 200 vazio, `historyMessages` 0, sem gravação; id omitido não aparece; id válido é ecoado; id desconhecido é 404 |
| 13 | `POST /chat` | timeout curto | 504 e contagem de conversas/mensagens igual à de antes do pedido |
| 14 | regressão | arena / bench | sem `ConversationStore` e sem janela de 12 |

Os `createApp` do teste de canal recebem `SqliteConversationStore(":memory:")`. Não podem abrir `./data/opspilot.db`.

Asserts antigos que ecoavam a mensagem crua (`react:listar alertas`, `plan-and-execute:abrir incidente`, `react:com extra`, `react:rapido`) passam a ecoar `Plantonista: ` na frente do pedido. Dois POST iguais sem id continuam com a mesma `answer`.

---

## 2. Smoke de reinício — obrigatória (manual rápida)

Num shell, com o arquivo de dados explícito (não usar `.env` dentro da app):

```bash
npm run dev
```

1. `POST /chat` com `{ "message": "listar alertas em disparo" }` sem `conversationId`.
2. Anotar `conversationId`, `historyMessages` (1) e `answer`.
3. Encerrar o processo e subir de novo com o mesmo `OPSPILOT_DB` (ou o default `./data/opspilot.db`).
4. `POST /chat` com o mesmo `conversationId` e outra mensagem.

**Esperado**: 200 com o mesmo id; o texto que a estratégia usaria contém o pedido anterior e a resposta anterior; `historyMessages` é 3. Um id inventado devolve 404.

---

## Critérios de pronto (ligação à spec)

| SC | Como validar neste quickstart |
|----|-------------------------------|
| SC-001 | §1 caso 6 e 7 |
| SC-002 | §2; caso 3 cobre o isolamento |
| SC-003 | §1 caso 5 e 8 |
| SC-004 | §1 casos 9–13 |
| SC-005 | §1 caso 7 (quatro mensagens; segundo prompt com os três trechos) |
| SC-006 | §1 inteiro em `:memory:` / substituto, sem rede |
