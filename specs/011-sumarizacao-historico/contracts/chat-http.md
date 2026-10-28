# Contract: POST /chat (delta — sumarização de histórico)

Delta sobre os contratos 007–010 de `chat-http.md`. Request body **inalterado**.

Modelo: [data-model.md](../data-model.md). Store: [conversation-store.md](./conversation-store.md). Sumarizador: [summarizer.md](./summarizer.md).

## Request

Inalterado: `message`, `strategy?`, `reflect?`, `conversationId?`, `userId?`.

## Composição do prompt (estratégia)

Ordem:

1. Bloco de memória (se `userId` + recall) — inalterado (008)
2. **`Resumo da conversa:\n{summary}`** — se existir resumo vigente com texto
3. Histórico bruto — no máximo **8** mensagens (`Plantonista` / `Copiloto`), incluindo o pedido atual

A estratégia continua a receber **uma** string já composta; não consulta o store.

## 200 — `metrics` e `trace`

```json
{
  "answer": "texto final",
  "trace": [
    { "type": "thought", "content": "…" },
    { "type": "answer", "content": "texto final" },
    { "type": "summarize", "content": "texto do resumo consolidado" }
  ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 120,
    "historyMessages": 8,
    "promptTokens": 1840,
    "contextBreakdown": {
      "history": 180,
      "memory": 45,
      "summary": 38
    }
  },
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Campo | Regra |
|-------|--------|
| `historyMessages` | Inteiro 0–**8**; mensagens brutas na janela (não inclui o resumo). |
| `contextBreakdown.history` | `estimateTokens` só do bloco de histórico bruto. |
| `contextBreakdown.memory` | Inalterado (010). |
| `contextBreakdown.summary` | `estimateTokens` do bloco de resumo; `0` se ausente. Sempre presente no 200 com métricas. |
| `trace` evento `summarize` | Presente **somente** se a consolidação deste turno persistiu com sucesso. `content` = texto upsertado. Ausente se lote incompleto ou falha soft do sumarizador. |

Pedido vazio: `historyMessages` 0; `contextBreakdown.summary` 0; sem evento `summarize`; sem upsert.

## 4xx / 504

Inalterados. Sem sumarização, sem mudança de resumo, sem evento `summarize`.

## Gatilho (comportamento observável)

- Enquanto houver menos de 8 mensagens gravadas fora da janela 8 ainda não cobertas pelo cursor → turnos 200 **sem** `summarize` e resumo inalterado.
- No turno cujo append completa o lote de 8 → um `summarize` no `trace` e resumo atualizado (merge).
- Turnos seguintes com lote incompleto → sem novo `summarize`.
