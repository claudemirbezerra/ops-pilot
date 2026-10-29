# Data Model: Grafo unificado de produção

**Feature**: `013-grafo-unificado`  
**Persistência**: nenhuma tabela nova. Estado do turno só em memória. Arena e stores existentes não ganham coluna.

Contratos: [contracts/production-graph.md](./contracts/production-graph.md), [contracts/chat-http.md](./contracts/chat-http.md).

---

## ProductionRoute

Rota de estratégia no chat.

| Valor | Significado |
| --- | --- |
| `react` | ReAct do registry |
| `plan-and-execute` | Plan-and-Execute do registry |
| `reflection` | Reflexão já existente sobre a base ReAct |

Não inclui `reflect:react` nem `reflect:plan-and-execute`.

---

## TraceNode

Etapa gravada em `node`.

| Valor | Quem emite nesta feature |
| --- | --- |
| `context` | Ninguém no caminho feliz (valor reservado) |
| `router` | Evento `route` |
| `react` | Eventos da rota efetiva `react` |
| `plan-and-execute` | Eventos da rota efetiva `plan-and-execute` |
| `reflection` | Eventos da rota efetiva `reflection` |
| `response` | `summarize` do fechamento e o `answer` do pedido vazio |

`node` é opcional no tipo compartilhado com a arena. No rastro devolvido pelo chat ele é obrigatório.

---

## RouteEvent

Variante nova de `TraceEvent`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `type` | `"route"` | Fixo |
| `route` | `ProductionRoute` | Rota que vai executar |
| `reason` | `string` | Não vazia depois de `trim` |
| `override` | `boolean` | `true` só quando `strategy` veio no pedido |
| `node` | `"router"` | Sempre, neste evento |

Motivo de override, exato: `Estratégia informada no pedido.`

Posição: primeiro evento de raciocínio do turno bem-sucedido. Não existe em mensagem vazia nem em decisão inválida.

---

## RouteDecision

Saída da porta do roteador automático (não é o evento de rastro).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `route` | `ProductionRoute` | Uma das três |
| `reason` | `string` | Trim não vazio |
| `llmCalls` | `number` | `1` na implementação com modelo |
| `promptTokens` | `number` | Tokens de prompt da decisão; `0` se o bruto não trouxer usage |

Decisão que não cumpre rota ou motivo não vira `RouteDecision`: o turno falha com `InvalidRouteError`.

---

## ProductionTurn (estado do grafo)

Um turno não vazio. Campos de entrada são escritos antes do `invoke`. Campos de saída são o estado final.

| Campo | Entrada / saída | Notas |
| --- | --- | --- |
| `message` | entrada | Texto atual do plantonista. O roteador usa só isto |
| `sections` | entrada | Seções já carregadas (system, summary, window, memory) para `buildContext` |
| `budgets` | entrada | `ContextBudgets` já resolvidos. O grafo não lê `process.env` |
| `override` | entrada | `ProductionRoute` ou ausente |
| `reflect` | entrada | `boolean`. Ausente trata como `false` |
| `maxIterations` | entrada | `8` no chat |
| `maxReflections` | entrada | `2` no chat |
| `userId` / `memoryStore` | entrada | Repassados a `strategy.run`, como hoje |
| `prompt` | saída do nó `context` | `built.prompt` |
| `built` | saída do nó `context` | `BuiltContext` para o breakdown no serviço |
| `route` / `reason` / `isOverride` | saída do nó `router` | |
| `answer` | saída do nó de estratégia | A resposta HTTP é esta string. O nó `response` não troca o texto |
| `trace` | saída | Evento `route` + eventos da estratégia carimbados |
| `llmCalls` / `promptTokens` | saída | Soma roteador + estratégia |

**Transições**:

1. `context` — preenche `prompt` e `built`. Não mexe no rastro.
2. `router` — ou grava o override sem `decide`, ou aceita uma `RouteDecision`. Anexa um `RouteEvent`. Falha inválida aborta aqui.
3. Um único nó entre `react`, `plan-and-execute`, `reflection` — `run` do strategy resolvido; carimba o rastro com a rota.
4. `response` — confirma `answer`. Sem chamada de modelo.

Não há transição de volta. As outras duas estratégias não rodam.

---

## StrategyResolution

Relação pura rota + `reflect` → estratégia executada. Detalhe na Decisão 5 de [research.md](./research.md). O nome interno `reflect:react` / `reflect:plan-and-execute` não aparece em `node` nem em `route`.

---

## ChatTrace (vista HTTP)

`TraceEvent` já persistido só na resposta JSON (o chat não grava o rastro no SQLite). Todo elemento tem `node`. Tipos anteriores seguem válidos, mais `route`.

Pedido vazio bem-sucedido:

| Campo | Valor |
| --- | --- |
| `answer` | Aviso operacional já existente |
| `trace` | Um `answer` com `node: "response"` |
| `route` | ausente |

---

## InvalidRouteError

Erro de domínio. Mensagem fixa: `Não foi possível decidir a rota.`

Sem `route`, sem `reason` no corpo HTTP. Mapeado para 502. Distinto de `UnknownStrategyError` (422) e `ChatTimeoutError` (504).
