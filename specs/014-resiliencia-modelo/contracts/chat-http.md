# Contract: POST /chat (resiliência de modelo)

Delta sobre o canal já existente (grafo unificado 013). Tipos: [data-model.md](../data-model.md).

## O que não muda

- `POST /chat`, JSON, validação Zod do body.
- 200 com `{ answer, trace, metrics, conversationId? }` em sucesso.
- 400 schema / JSON; 422 estratégia desconhecida; 404 conversa; 502 rota inválida; 504 timeout; 503 embedding.
- Pedido vazio: 200 com aviso operacional, sem consulta ao modelo → **sem** `metrics.modelUsed` e **sem** evento `fallback`.

## 200 — métricas e rastro

Em turno que consultou o modelo e respondeu com sucesso:

- `metrics.modelUsed`: string não vazia (id OpenRouter do modelo que atendeu a resposta).
- Se houve troca para o reserva: `trace` contém pelo menos um item `{ "type": "fallback", "from": "<principal>", "to": "<reserva>", "node"?: "..." }`.
- Se só o principal atendeu: nenhum evento `type === "fallback"`; `modelUsed` = principal.

Campos existentes (`llmCalls`, `latencyMs`, `promptTokens`, `historyMessages`, `contextBreakdown`, …) permanecem.

Exemplo (fallback):

```json
{
  "answer": "…",
  "trace": [
    {
      "type": "fallback",
      "from": "openai/gpt-4o",
      "to": "openai/gpt-4o-mini",
      "node": "react"
    }
  ],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 12,
    "promptTokens": 40,
    "modelUsed": "openai/gpt-4o-mini",
    "historyMessages": 1,
    "contextBreakdown": { "history": 0, "memory": 0, "summary": 0 }
  }
}
```

## 503 — modelo indisponível

Quando principal (e reserva, se configurado) esgotam na consulta necessária ao turno:

```json
{ "message": "Modelo indisponível." }
```

- Status **503**.
- Sem `answer`, `trace` ou `metrics`.
- Distinto de 503 de embedding (mensagem diferente, mesmo status).
- Distinto de config ausente (`MissingModelConfigError` — tratamento já existente na borda/startup; não redefinir aqui).

## Ordem de erros (inalterada, com o novo 503)

Após schema e regras de estratégia/conversa: execução do turno. Falha total de modelo → 503. Timeout continua 504. Soft-answer `MODEL_UNAVAILABLE_ANSWER` em **200** **não** é contrato válido para falha total pós-resiliência.

## Injeção para teste

- Registry / estratégia fake que lança `ModelUnavailableError` → assert 503.
- Fake que devolve `metrics.modelUsed` e opcionalmente evento `fallback` → assert 200.
- Não exigir OpenRouter real.
