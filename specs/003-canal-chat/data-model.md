# Data Model: Canal de chat

Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/). Não há tabela nova nem histórico de conversa. O resultado de sucesso reutiliza `StrategyResult` de `001-nucleo-raciocinio`.

## Pedido de conversa (ChatRequest)

Depois do parse na borda:

| Campo | Regras |
|-------|--------|
| `message` | String obrigatória. Pode ser vazia ou só espaços. Nesse caso a execução segue o pedido vazio já definido e o HTTP continua 200. |
| `strategy` | String opcional. Ausente → `react`. Presente → o catálogo decide. Não há trim nem normalização de caixa. |
| `reflect` | Boolean opcional. Ausente ou `false` → estratégia base. `true` → a base resolvida entra em `wrapWithReflection`. |

Chaves fora desses três campos não entram no pedido. `null` em qualquer um dos três é corpo inválido (tipo errado).

## Catálogo do canal

| Nome | Estratégia base | Com `reflect: true` |
|------|-----------------|---------------------|
| `react` | ReAct já existente | `wrapWithReflection`, nome interno `reflect:react` |
| `plan-and-execute` | Plan-and-Execute já existente | `wrapWithReflection`, nome interno `reflect:plan-and-execute` |

Nomes que não estão na tabela, inclusive `""`, `React`, `reflect:react` e `reflect:plan-and-execute`, são estratégia desconhecida. O catálogo de produção não inclui substitutos de teste. O ensaio passa outro mapa com os mesmos nomes de canal apontando para estratégias falsas.

## Opções de execução (fora do pedido)

| Campo | Regras |
|-------|--------|
| `maxIterations` | Inteiro 8, o padrão da arena. Passado a `run`. Não vem no JSON. |
| `maxReflections` | Inteiro 2 quando `reflect` é verdadeiro. O envoltório já trata omissão como 2. Não vem no JSON. |
| `timeoutMs` | Inteiro `180000` no `npm run dev`. O teste pode injetar outro valor. Cobre a espera inteira, com ou sem reflexão. |

## Resultado de sucesso (200)

O corpo é o `StrategyResult` da execução daquele turno:

| Campo | Regras |
|-------|--------|
| `answer` | Texto final. No pedido vazio, o texto orientativo já definido no núcleo. |
| `trace` | Eventos daquela execução. Com reflexão, inclui `critique` como a camada de `002` já faz. Sem reflexão, não há crítica nova do envoltório. |
| `metrics.llmCalls` | Consultas daquela execução, já somadas pelo núcleo ou pelo envoltório. |
| `metrics.latencyMs` | Tempo daquela execução. |

Dois pedidos não misturam `trace` nem `metrics`. O store operacional que as ferramentas já compartilham não é uma conversa e não entra neste corpo.

## Recusa de corpo inválido (400)

| Campo | Regras |
|-------|--------|
| `issues` | Lista com um item por problema. Item de schema Zod: pelo menos `path` (array de segmentos) e `message` (string). JSON ilegível: um item `{ path: [], message: "JSON inválido." }`. |

Não há `answer`, `trace` nem `metrics`. A estratégia não chega a executar.

## Recusa de estratégia desconhecida (422)

| Campo | Regras |
|-------|--------|
| `message` | `Estratégia desconhecida: <nome>.` O `<nome>` é o texto recebido, sem reescrever caixa. |

Não usa `issues`. Acontece só depois do corpo ser estruturalmente válido. Reflexão pedida não é aplicada.

## Tempo esgotado (504)

| Campo | Regras |
|-------|--------|
| `message` | `Tempo esgotado: a resposta não ficou pronta em <segundos> segundos.` No processo de desenvolvimento, `<segundos>` é `180`. |

Não há `answer`, `trace` nem `metrics` de sucesso. Um resultado que apareça depois do limite não substitui esse corpo na mesma resposta.

## O que não é entidade desta feature

- Sessão, histórico ou id de conversa.
- Teto de iteração ou de reflexão no pedido.
- Linha nova em MySQL.
- Nome de estratégia substituta publicado no catálogo de produção.
