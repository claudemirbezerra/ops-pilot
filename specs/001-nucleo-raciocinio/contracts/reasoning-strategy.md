# Contract: ReasoningStrategy

Contrato interno que a arena consome. As duas estratégias implementam a mesma forma.

## Estratégia

| Campo | Forma |
|-------|--------|
| `name` | `"react"` ou `"plan-and-execute"` |
| `run(input, options)` | Devolve `StrategyResult` |

`options.maxIterations` é inteiro ≥ 1. O padrão da arena, quando a flag falta, é 8.

## StrategyResult

| Campo | Forma |
|-------|--------|
| `answer` | string não vazia |
| `trace` | lista ordenada de eventos |
| `metrics.llmCalls` | inteiro ≥ 0 |
| `metrics.latencyMs` | inteiro ≥ 0 |

O último evento do rastro é `answer` e o `content` é igual a `answer`, inclusive no teto de iterações e no pedido vazio.

## Eventos

| type | payload |
|------|---------|
| `thought` | `{ content: string }` |
| `action` | `{ tool: "list_alertas" \| "open_incident" \| "resolver_incident", args: object }` |
| `observation` | `{ content: string }` |
| `plan` | `{ steps: string[] }` |
| `critique` | `{ content: string }` |
| `answer` | `{ content: string }` |

## ReAct

- Usa o agente pré-construído.
- Rastro reconstruído das mensagens finais: tool call → `action`; resultado da ferramenta → `observation`; texto junto de tool call → `thought`; mensagem final sem tool call → `answer`.
- Para ao completar `maxIterations` consultas, com resposta declarando o teto.
- `plan` e `critique` não são obrigatórios nesta estratégia.

## Plan-and-Execute

- Emite `plan` antes do primeiro passo.
- Um passo por vez. Depois de cada passo, emite `critique` com a revisão do restante.
- Não executa o nono passo.
- Se `maxIterations` for menor que 8, o número de passos executados não passa desse teto.
- Lista de passos vazia depois da revisão encerra com `answer`.

## Pedido vazio

Não chama o modelo. `llmCalls` é 0. Rastro com um único `answer` pedindo um pedido operacional. O store não muda.

## Falha de modelo

Se a consulta real falha, o resultado ainda traz o rastro até ali, as métricas do que ocorreu e um `answer` informando a indisponibilidade. Isso não se aplica à ausência de `OPENROUTER_API_KEY` ou `OPENROUTER_MODEL`: essa falha é erro de domínio na fábrica, antes da execução, e a arena sai com código 1.
