# Contract: Grafo de produção

API interna do turno de chat não vazio. Modelo em [data-model.md](../data-model.md). HTTP em [chat-http.md](./chat-http.md).

Módulos previstos:

- `src/agents/production-route.ts` — funções puras (rota, carimbo, resolução, prompt).
- `src/agents/production-graph.ts` — `StateGraph`, `createLlmRouter`, `runProductionGraph`.

Arena e bench não chamam este grafo.

## Nós e arestas

Nomes de nó, nesta ordem de execução feliz:

1. `context`
2. `router`
3. exatamente um de `react` | `plan-and-execute` | `reflection`
4. `response`

`context` chama `buildContext(sections, budgets)` e guarda `prompt` + `built`. Não emite evento.

`router`:

- Com `override`: não chama `decide`. Evento `route` com essa rota, `override: true`, `reason` = `Estratégia informada no pedido.`, `node` = `router`. Custo do roteador = 0.
- Sem `override`: chama `router.decide(message)` com a mensagem atual, não com o prompt montado. Evento `route` com `override: false`, o `reason` devolvido (trim não vazio) e `node` = `router`. Soma `llmCalls` e `promptTokens` da decisão.
- Decisão inválida (throw, rota fora das três, motivo vazio ou só espaços): lança `InvalidRouteError`. Não anexa `route`. Não executa estratégia.

O nó de estratégia chama `resolveProductionStrategy(...).run(prompt, options)` com `maxIterations`, `maxReflections`, `userId`, `memoryStore`. Carimba **todos** os eventos devolvidos com `node` igual à rota efetiva. O `answer` do turno é o `answer` desse `run`.

`response` não chama modelo e não substitui `answer`. Não acrescenta evento.

## Porta do roteador

```ts
type ProductionRouter = {
  decide(message: string): Promise<{
    route: "react" | "plan-and-execute" | "reflection";
    reason: string;
    llmCalls: number;
    promptTokens: number;
  }>;
};
```

`createLlmRouter()` (produção, quando ninguém injeta):

- Schema Zod com `route` enum das três rotas e `reason` string.
- `createModel().withStructuredOutput(schema, { includeRaw: true })`.
- System prompt = `ROUTER_PROMPT` (constante exportada).
- `llmCalls: 1`, `promptTokens: readPromptTokens(raw)`.
- Parse impossível, rota inesperada ou motivo trimado vazio → `InvalidRouteError` com a mensagem fixa. Sem detalhe do modelo.

`ROUTER_PROMPT` inclui esta tabela e nenhuma outra rota:

| Pedido do plantonista | Rota |
| --- | --- |
| Uma consulta ou uma ação direta (listar alertas, consultar status ou runbook, abrir ou resolver um incidente isolado, esquecer uma preferência) | `react` |
| Uma sequência de passos dependentes (investigar e então agir em mais de uma etapa) | `plan-and-execute` |
| Pedido de revisão, conferência ou maior confiança antes de aceitar a resposta | `reflection` |

## Resolução da estratégia

`resolveProductionStrategy` é pura. Registry de produção: `channelStrategies` (`react` e `plan-and-execute` apenas).

- Rota `reflection`: `wrapWithReflection` da base `react`, nome interno `reflect:react`, um ciclo. `reflect: true` não envolve de novo.
- Rota `react` ou `plan-and-execute` com `reflect: true`: wrap dessa base (nomes internos já existentes), teto `maxReflections`. O `node` carimbado continua sendo a rota, não o nome interno.
- `reflect` ausente ou `false`: a base crua, exceto na rota `reflection`, que já é o wrap.

Crítico: o injetado em `createApp` / `runChat`; senão `createLlmCritic()` só quando o wrap realmente acontece. Override e rota sem reflexão não criam crítico LLM.

## Métricas devolvidas pelo grafo

| Campo | Regra |
| --- | --- |
| `llmCalls` | Decisão (0 ou o valor da porta) + `metrics.llmCalls` da estratégia |
| `promptTokens` | Idem para tokens |
| `latencyMs` | Relógio do `invoke` completo |

`historyMessages` e `contextBreakdown` ficam no `runChat`, usando `built` devolvido pelo grafo. O serviço não chama `buildContext` de novo.

## Erros

| Situação | Erro | Estratégia roda? |
| --- | --- | --- |
| `strategy` do pedido fora das três rotas | `UnknownStrategyError` no serviço, antes do grafo | Não |
| `decide` inválido | `InvalidRouteError` | Não |
| Base ausente no registry injetado | Erro de composição antes do `run` | Não |

Mensagem de `InvalidRouteError`: `Não foi possível decidir a rota.`
