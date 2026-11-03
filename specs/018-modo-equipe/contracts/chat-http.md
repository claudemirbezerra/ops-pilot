# Contract: POST /chat (rota team)

Delta sobre o canal já existente. Não muda path, verbo nem o schema Zod do body.

## O que não muda

- `message` string obrigatória. `strategy` string opcional. `reflect` boolean opcional. `conversationId` e `userId` como já estão.
- Tipo errado de `strategy` → 400. JSON ilegível → 400.
- Mensagem vazia ou só espaços → 200 com o aviso operacional já existente, sem `route` e sem `handoff`, mesmo se `strategy` for `team` ou um nome desconhecido. Continua sem 422.
- Nome que não é rota exata (`Team`, `""`, `reflect:react`, nomes da arena) → 422 `{ message: "Estratégia desconhecida: <texto>." }` antes do grafo e antes do 404 de conversa.
- 504 tempo esgotado cobre o turno inteiro, inclusive supervisor e papéis.
- 503 para `ModelUnavailableError` e para embedding indisponível.
- 202 quando há `pendingApproval`: corpo com `approvalId`, `pending`, `trace`, `metrics`. Sem `answer`. O incidente ainda não foi gravado.
- Negar a aprovação não grava abertura nem resolução.

## Rota `team`

`strategy: "team"` é override. O 200 (ou o 202, se o executor parou na espera) traz:

```json
{
  "type": "route",
  "route": "team",
  "reason": "Estratégia informada no pedido.",
  "override": true,
  "node": "router"
}
```

O roteador automático não é consultado e não entra em `metrics.llmCalls` nem em `promptTokens`.

Sem `strategy`, um roteador que devolve `team` e um motivo não vazio produz o mesmo evento com `override: false` e esse motivo. As outras três rotas não executam.

`reflect: true` com rota efetiva `team` não acrescenta ciclo de revisão. O teto continua 8 decisões do supervisor.

## Tabela do roteador automático

O prompt do roteador contém as quatro linhas da spec, com a frase de fechamento `Não invente uma quinta rota.` Não contém uma quinta rota. A suíte confere o texto; não chama o modelo.

| Pedido do plantonista | Rota |
| --- | --- |
| Uma consulta ou uma ação direta (listar alertas, consultar status ou runbook, abrir ou resolver um incidente isolado, esquecer uma preferência) | `react` |
| Uma sequência de passos dependentes feita pelo mesmo agente (investigar e então agir em mais de uma etapa) | `plan-and-execute` |
| Pedido de revisão, conferência ou maior confiança antes de aceitar a resposta | `reflection` |
| Diagnóstico, plano e ação sobre incidentes que devem passar por papéis separados (leitura, plano sem ferramentas, execução de incidente) | `team` |

## 200 quando a equipe encerra

`answer` é o `brief` de `encerrar`, ou, se oito decisões rodaram sem `encerrar`, exatamente:

`Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).`

`trace` inclui o evento `route` e um `handoff` por decisão válida, com `node: "team"`, nesta ordem relativa: `route` primeiro, cada `handoff` antes dos eventos do papel que ele chamou. Não há nono `handoff`.

`metrics.llmCalls` e `promptTokens` incluem o supervisor e os papéis. No override, não incluem o roteador.

## 202 quando o executor pede incidente

O `trace` inclui o `handoff` cujo `next` é `executor` e o `action` de `open_incident` ou `resolver_incident`. Não há `observation` de incidente gravado. Nenhum papel posterior roda nessa resposta. O store não contém o incidente novo nem a resolução nova.

## 502

Decisão de supervisor ilegível:

```json
{ "message": "Não foi possível decidir o próximo papel." }
```

Papel ilegível (plano vazio ou passo em branco):

```json
{ "message": "Não foi possível cumprir o papel." }
```

Os dois corpos são só `{ message }`. Sem `answer`, `trace` ou `metrics`. Distintos de 400, 422, 504 e do 502 já existente `Não foi possível decidir a rota.`

## Injeção para teste

`createApp` continua aceitando `router` e `registry`. O registry de teste que exercita `team` inclui a estratégia falsa ou a estratégia real com supervisor e papéis falsos. Sem OpenRouter.
