# Contract: POST /chat (delta — medição de contexto)

Delta sobre os contratos 007–009 de `chat-http.md`. Request body **inalterado**. Resposta 200 ganha campos em `metrics`.

Modelo de dados: [data-model.md](../data-model.md). Tokens: [tokens.md](./tokens.md).

## Request

Inalterado: `message`, `strategy?`, `reflect?`, `conversationId?`, `userId?`.

## 200 de turno executado — `metrics`

```json
{
  "answer": "texto final",
  "trace": [{ "type": "answer", "content": "texto final" }],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 120,
    "historyMessages": 3,
    "promptTokens": 1840,
    "contextBreakdown": {
      "history": 210,
      "memory": 45
    }
  },
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Campo | Tipo | Regra |
|-------|------|--------|
| `promptTokens` | inteiro ≥ 0 | Soma real do usage de prompt das chamadas ao modelo **deste turno** (estratégia + reflexão se `reflect`). `0` se sem usage. **Não** inclui aprendizado 009. |
| `contextBreakdown.history` | inteiro ≥ 0 | `estimateTokens` do texto de histórico composto entregue à estratégia. |
| `contextBreakdown.memory` | inteiro ≥ 0 | `estimateTokens` do bloco de recall; `0` sem `userId` / sem fatos. |
| `llmCalls` / `latencyMs` / `historyMessages` | — | Inalterados (007+). |

`contextBreakdown` **sempre** traz as duas chaves no 200 com métricas.

Sem obrigação de `promptTokens === history + memory` (heurística vs real).

## 200 de pedido vazio

```json
{
  "answer": "Informe um pedido operacional …",
  "trace": [{ "type": "answer", "content": "…" }],
  "metrics": {
    "llmCalls": 0,
    "latencyMs": 0,
    "historyMessages": 0,
    "promptTokens": 0,
    "contextBreakdown": { "history": 0, "memory": 0 }
  }
}
```

(`conversationId` segue regras 007.)

## 4xx / 504

Inalterados: **sem** `metrics` (logo sem `promptTokens` / `contextBreakdown`).

## Regressões

- Sem `userId`: `contextBreakdown.memory === 0`; history reflete só a janela.
- Com `userId` + recall: `memory` = estimativa do bloco injetado; prompt da estratégia continua memória + histórico.
- Fake strategy nos testes: pode fixar `promptTokens`; HTTP ecoa o valor + breakdown calculado no service.
