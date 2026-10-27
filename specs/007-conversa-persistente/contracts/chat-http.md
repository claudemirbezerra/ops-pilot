# Contract: POST /chat com conversa

Estende o canal de [specs/003-canal-chat/contracts/chat-http.md](../../003-canal-chat/contracts/chat-http.md). Onde este arquivo não fala, o contrato 003 continua valendo (`strategy`, `reflect`, catálogo, 400, 422, 504, trace).

Store: [conversation-store.md](./conversation-store.md). Janela: [data-model.md](../data-model.md).

## Rota

`POST /chat`

`Content-Type: application/json`.

## Ordem

1. JSON ilegível → 400 e para.
2. Schema do corpo → 400 e para. Não consulta catálogo nem store.
3. Nome ausente vira `react`. `reflect` ausente vira `false`. Nome fora do catálogo → 422 e para, **sem** olhar `conversationId`.
4. `conversationId` presente e desconhecido → 404 e para, sem `strategy.run` e sem gravar.
5. Mensagem em branco ou só espaços → 200 de pedido vazio (abaixo), sem `strategy.run` e sem gravar.
6. Compor a janela e executar. Dentro do limite → gravar o par e responder 200. Limite estourado antes → 504, store igual ao início do pedido.

## Pedido

```json
{ "message": "Quais alertas estão em disparo?" }
```

| Campo | Obrigatório | Tipo |
|-------|-------------|------|
| `message` | sim | string |
| `strategy` | não | string |
| `reflect` | não | boolean |
| `conversationId` | não | string não vazia depois de `trim` |

Chaves extras são ignoradas. `conversationId` numérico, `null`, `""` ou `"   "` → 400 com `issues`. O id não precisa ser UUID para passar do 400; se não existir, é 404.

## Texto entregue à estratégia

Um único string, linhas `Plantonista: ...` ou `Copiloto: ...` separadas por `\n`, ordem cronológica, no máximo 12 mensagens. O pedido atual é a última linha `Plantonista:` e entra na contagem. A estratégia não recebe a mensagem crua quando o turno executa.

Primeiro turno de `listar alertas`:

```text
Plantonista: listar alertas
```

Turno seguinte, `e agora?`, depois de um `answer` `texto final` no mesmo fio:

```text
Plantonista: listar alertas
Copiloto: texto final
Plantonista: e agora?
```

ReAct, Plan-and-Execute e a reflexão recebem esse mesmo texto. `historyMessages` não aumenta por regeneração.

## 200 de turno executado

```json
{
  "answer": "texto final",
  "trace": [{ "type": "answer", "content": "texto final" }],
  "metrics": { "llmCalls": 0, "latencyMs": 1, "historyMessages": 1 },
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

- `conversationId` é o id novo, ou o mesmo que foi enviado.
- `historyMessages` é inteiro de 1 a 12, igual ao número de linhas do texto composto.
- `llmCalls` e `latencyMs` continuam sendo os da execução.
- Depois da resposta, o store tem o pedido (`user`, texto cru) e o `answer` (`assistant`), nesta ordem.
- Resposta de modelo indisponível ou teto de iterações, quando a estratégia termina em resultado, grava do mesmo jeito. Não é 504.

## 200 de pedido vazio

Mensagem `""` ou só espaços, com estratégia conhecida:

- Corpo no formato do pedido vazio já existente (`answer` orientativo, `trace`, `metrics.llmCalls` 0, `metrics.latencyMs` 0) mais `metrics.historyMessages` 0.
- Sem `conversationId` no JSON se o cliente omitiu o campo.
- Se o cliente enviou um id existente, o JSON inclui esse `conversationId` e o store não ganha mensagem.
- Id desconhecido continua sendo 404, mesmo com mensagem em branco (a ordem olha o id antes do vazio).
- Nome de estratégia desconhecido continua 422, mesmo com mensagem em branco.

## 404

```json
{ "message": "Conversa desconhecida: 550e8400-e29b-41d4-a716-446655440000." }
```

O id na frase é o texto enviado (depois do trim). Sem `answer`, `trace`, `metrics` ou `conversationId`. Nenhuma conversa nova.

## 400, 422, 504

Inalterados em relação ao contrato 003, com um acréscimo: não devolvem `conversationId` e não gravam. 504 também não deixa o pedido sem resposta dentro do fio.

Um pedido com estratégia desconhecida **e** id inexistente é 422, não 404.

## Independência

Dois POST sem `conversationId` abrem dois fios. Cada 200 traz o `trace` e as `metrics` da própria execução. Um 504 não é reescrito se a estratégia terminar depois, e esse término tardio não grava.
