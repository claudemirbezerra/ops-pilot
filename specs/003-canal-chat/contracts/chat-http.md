# Contract: POST /chat

Borda HTTP do canal de conversa. Campos em [data-model.md](../data-model.md). A escolha da estratégia está em [strategy-registry.md](./strategy-registry.md).

## Rota

`POST /chat`

`Content-Type: application/json`.

Outras rotas e outros métodos ficam de fora deste contrato. O processo de `npm run dev` escuta em `127.0.0.1`, porta `PORT` ou 3000, e não lê arquivo `.env`.

## Ordem

1. JSON ilegível → 400 e para.
2. Schema do corpo → 400 e para, sem consultar o catálogo e sem `run`.
3. Nome ausente vira `react`. `reflect` ausente vira `false`.
4. Nome fora do catálogo → 422 e para, mesmo com `reflect: true`.
5. Executar. Se o resultado chega dentro do limite → 200. Se o limite estoura antes → 504.

## Pedido

```json
{ "message": "Quais alertas estão em disparo?" }
```

| Campo | Obrigatório | Tipo |
|-------|-------------|------|
| `message` | sim | string |
| `strategy` | não | string |
| `reflect` | não | boolean |

Chaves extras são ignoradas.

## 200

```json
{
  "answer": "texto final",
  "trace": [{ "type": "answer", "content": "texto final" }],
  "metrics": { "llmCalls": 0, "latencyMs": 0 }
}
```

`trace` segue os tipos já definidos no núcleo (`thought`, `action`, `observation`, `plan`, `critique`, `answer`). `metrics` traz `llmCalls` e `latencyMs` daquela execução.

Pedido com `message` vazia ou só espaços: 200 com a resposta de pedido vazio do núcleo, sem consulta ao modelo.

## 400

```json
{
  "issues": [
    { "path": ["message"], "message": "Invalid input: expected string, received undefined" }
  ]
}
```

O texto de `message` é o do Zod da versão do projeto; o contrato exige `path` e `message` em cada item, e um item por falha. Exemplos que caem aqui:

- corpo ausente ou objeto sem `message`;
- `message`, `strategy` ou `reflect` com tipo errado, inclusive `null`;
- JSON que não parseia → `issues: [{ "path": [], "message": "JSON inválido." }]`.

## 422

```json
{ "message": "Estratégia desconhecida: reflect:react." }
```

O nome entre o prefixo e o ponto final é o valor enviado. Vale para string vazia, caixa diferente e qualquer nome que não seja `react` ou `plan-and-execute`.

## 504

```json
{ "message": "Tempo esgotado: a resposta não ficou pronta em 180 segundos." }
```

Quando o limite injetado no teste não é 180 segundos, o número na frase é esse limite em segundos. O corpo não contém `answer`, `trace` nem `metrics`.

## Independência

Cada resposta 200 carrega só o rastro e as métricas do próprio `run`. Um 504 não é reescrito se a estratégia terminar depois.
