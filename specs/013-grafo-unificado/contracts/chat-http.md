# Contract: POST /chat (grafo unificado)

Delta sobre o canal já existente. Campos novos do rastro em [data-model.md](../data-model.md). O grafo está em [production-graph.md](./production-graph.md).

## O que não muda

- `POST /chat`, JSON.
- Body Zod: `message` string obrigatória; `strategy` string opcional; `reflect` boolean opcional; `conversationId` e `userId` como já estão. Chaves extras ignoradas. Tipo errado → 400 `{ issues }`. JSON ilegível → 400.
- 200 `{ answer, trace, metrics, conversationId? }`.
- 404 conversa inexistente. 503 embedding indisponível. 504 tempo esgotado, corpo `{ message }` sem `answer` / `trace` / `metrics`.
- Timeout padrão 180s cobre o turno inteiro, agora incluindo a decisão automática.
- Persistência, resumo e aprendizado continuam depois de uma resposta bem-sucedida. O evento `summarize`, quando entra no `trace`, traz `node: "response"`.

## Ordem (mensagem não vazia)

1. JSON / schema → 400 e para.
2. `strategy` presente e fora de `react`, `plan-and-execute`, `reflection` → 422 `{ message: "Estratégia desconhecida: <texto>." }` e para. Vale para `""`, caixa diferente e `reflect:react` / `reflect:plan-and-execute`. Não consulta o roteador. Não executa estratégia. Acontece **antes** do 404 de `conversationId`.
3. `conversationId` inexistente → 404.
4. Caminho do grafo. Sucesso → 200. Decisão automática inválida → 502. Limite estoura antes → 504.

`strategy` ausente **não** vira `react`. O roteador escolhe.

`strategy` igual a uma das três rotas é override: o 200 traz o evento `route` com `override: true`.

## Ordem (mensagem vazia ou só espaços)

1. Schema ok.
2. `conversationId` inexistente → 404 (a estratégia nem é lida).
3. 200 com o aviso operacional já existente. `trace` tem um `answer` com `node: "response"` e não tem `route`. `strategy` conhecida ou desconhecida não gera 422 e não executa nada.

## 200 (turno com rota)

Trecho mínimo do `trace` (eventos da estratégia vêm depois, cada um com `node`):

```json
{
  "answer": "texto da estratégia escolhida",
  "trace": [
    {
      "type": "route",
      "route": "plan-and-execute",
      "reason": "Estratégia informada no pedido.",
      "override": true,
      "node": "router"
    }
  ],
  "metrics": {
    "llmCalls": 0,
    "latencyMs": 0,
    "promptTokens": 0,
    "historyMessages": 1,
    "contextBreakdown": { "history": 0, "memory": 0, "summary": 0 }
  }
}
```

Sem override, `override` é `false`, `reason` é o motivo do roteador, e `metrics.llmCalls` / `promptTokens` incluem essa decisão além da estratégia.

Todo item de `trace` tem `node` em `context`, `router`, `react`, `plan-and-execute`, `reflection` ou `response`. O `node` dos eventos da estratégia é a rota efetiva.

## 502

```json
{ "message": "Não foi possível decidir a rota." }
```

Só quando a decisão automática não entrega rota válida e motivo não vazio. Sem `answer`, `trace` ou `metrics`. Não usar este status para nome desconhecido (isso permanece 422).

## Injeção para teste

`createApp` aceita `router` opcional, além de `registry` e `critic`. Sem `router`, o processo usa o roteador com modelo. Testes que omitem `strategy` injetam um `decide` determinístico. Testes de override podem omitir `router`: `decide` não roda.
