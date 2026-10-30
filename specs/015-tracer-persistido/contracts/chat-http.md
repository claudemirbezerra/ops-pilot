# Contract: POST /chat (requestId + persistência)

Delta sobre o canal existente (013/014). Store: [request-store.md](./request-store.md). Logger: [logger.md](./logger.md).

## O que não muda

- Body Zod (`message`, `strategy?`, `reflect?`, `conversationId?`, `userId?`).
- Semântica de `answer`, `trace`, `metrics`, `conversationId?`.
- Códigos 400 / 422 / 404 conversa / 502 / 504 / 503.

## Correlação

1. Após parse JSON/schema com sucesso (ou, no mínimo, assim que o handler assume o ciclo de vida do turno), o servidor gera `requestId = randomUUID()`.
2. Header de resposta: `X-Request-Id: <requestId>` em **toda** resposta desse ciclo em que o id já foi gerado (200 e erros de domínio posteriores).
3. Corpo **200** inclui `"requestId": "<mesmo valor>"`.

Exemplo 200 (campos existentes omitidos parcialmente):

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "answer": "…",
  "trace": [ /* … */ ],
  "metrics": { "llmCalls": 1, "latencyMs": 12, "promptTokens": 40, "historyMessages": 1, "contextBreakdown": { "history": 0, "memory": 0, "summary": 0 } }
}
```

Headers:

```http
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
```

## Persistência e log (caminho 200)

Ordem após `runChat` bem-sucedido:

1. Para cada evento em `result.trace` (índice `seq`): emitir linha de log de metadados.
2. Opcional: linha `request_end` / ciclo de vida.
3. `requestStore.save({ id: requestId, createdAt, metrics: result.metrics, trace: result.trace })`.
4. `res.status(200).json({ requestId, answer, trace, metrics, conversationId? })`.

Pedido em branco (200 orientativo): mesma ordem (grava request + trace mínimo; log conforme eventos presentes).

## Erros

- 400 de schema **antes** de gerar id: header `X-Request-Id` não obrigatório.
- Após id gerado: header presente; corpo de erro permanece `{ message }` ou `{ issues }` (sem exigir `requestId` no JSON de erro no MVP).
- Falha de `save` após turno ok: tratar como erro de servidor (não mascarar com 200 sem persistência) — preferência: falhar o request se a gravação obrigatória falhar.

## Injeção para teste

- `CreateAppOptions.requestStore` + logger writer collector.
- Registry fake determinístico.
- Assert: corpo.`requestId` === header `X-Request-Id`; `GET /request/:id` vê mesmos eventos.
