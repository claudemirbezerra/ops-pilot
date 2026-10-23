# Data Model: Camada Reflection

Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/). Reutiliza rastro e métricas de `001-nucleo-raciocinio` sem novos tipos de evento.

## Decisão do crítico (CritiqueDecision)

| Campo | Regras |
|-------|--------|
| `approved` | Boolean. `true` = resposta final; `false` = reprova. |
| `feedback` | String. Obrigatória na forma; pode ser vazia. Se `approved === false` e `feedback` só tem espaços, a regeneração usa o texto padrão de reprovação sem detalhe. |

Não persiste. Materializa-se no rastro como evento `critique`.

## Conteúdo do evento `critique` (reflexão)

| Campo | Regras |
|-------|--------|
| `type` | Sempre `"critique"` (mesmo vocabulário do núcleo). |
| `content` | Texto legível: indica aprovação ou reprovação e inclui o feedback quando houver. Em indisponibilidade do crítico, texto legível declarando a falha (sem inventar aprovação). |

Eventos `critique` emitidos pelo replanner de Plan-and-Execute continuam válidos; a reflexão **acrescenta** outros do mesmo tipo após cada avaliação do envoltório.

## Teto de reflexões

| Campo | Regras |
|-------|--------|
| `maxReflections` | Inteiro ≥ 1. Padrão **2** quando a flag da arena está ausente. Valor &lt; 1 é recusado na borda (não chega ao envoltório). |
| Semântica | Conta regenerações após reprovação. A primeira execução da base **não** consome o teto. |

Com teto `N`: no máximo `N` regenerações e no máximo `N + 1` execuções da base (inicial + regenerações), além das avaliações do crítico.

## Opções de execução (extensão)

| Campo | Regras |
|-------|--------|
| `maxIterations` | Como em `001`: inteiro ≥ 1; passado à estratégia base. |
| `maxReflections` | Inteiro ≥ 1; só o envoltório de reflexão usa. Bases sem reflexão ignoram. |

## Estratégia com reflexão

| Campo | Regras |
|-------|--------|
| `name` | `"reflect:react"` ou `"reflect:plan-and-execute"`. |
| `base` | Estratégia com `name` `"react"` ou `"plan-and-execute"`, respectivamente. |
| `run` | Mesma assinatura do contrato comum; devolve `StrategyResult`. |

## Resultado (`StrategyResult`)

Inalterado em forma:

| Campo | Regras na reflexão |
|-------|-------------------|
| `answer` | Resposta aprovada, ou a da última tentativa da base (teto esgotado / crítico indisponível), ou a da base em curto-circuito (pedido vazio / falha sem crítica). |
| `trace` | Concatenação ordenada das passagens da base + eventos `critique` do envoltório. Último evento é `answer` com o mesmo `content` que `answer`. |
| `metrics.llmCalls` | Soma das consultas das bases + consultas do crítico. |
| `metrics.latencyMs` | Tempo de parede do ciclo completo do envoltório. |

## Pedido com feedback (regeneração)

Valor de `input` passado à base nas regenerações (não é entidade persistida):

| Parte | Regras |
|-------|--------|
| Pedido original | Texto do plantonista, intacto. |
| Bloco de feedback | Feedback do crítico, ou texto padrão se vazio na reprovação. |

Função pura: mesmos original + feedback → mesmo string.

## Estados do ciclo

```text
inicial → base_run → (vazio? fim)
                  → (base falhou sem resposta útil? fim)
                  → crítico → aprovado? fim
                            → crítico indisponível? fim (última resposta da base)
                            → reprovado e regenerações_restantes > 0? regenerar → base_run
                            → reprovado e teto esgotado? fim (última resposta da base)
```

`regenerações_restantes` começa em `maxReflections` e decrementa a cada regeneração disparada.
