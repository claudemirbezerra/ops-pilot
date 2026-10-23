# Contract: Catálogo do canal

Resolução interna usada por `POST /chat`. A forma do resultado continua [StrategyResult](../../001-nucleo-raciocinio/contracts/reasoning-strategy.md). A reflexão continua [wrapWithReflection](../../002-camada-reflection/contracts/reflection-layer.md).

## resolve

| Entrada | Forma |
|---------|--------|
| `strategy` | String já validada como string. Ausente na borda vira `react` antes daqui. |
| `reflect` | Boolean. Ausente na borda vira `false`. |
| `registry` | Mapa nome → `ReasoningStrategy`. Produção: `react` e `plan-and-execute`. Teste: o mesmo tipo de mapa, injetado. |
| `critic` | Porta já existente. Produção: crítico LLM. Teste: substituto. Só é chamado quando `reflect` é `true` e o nome existe. |

| `strategy` | `reflect` | Resultado |
|------------|-----------|-----------|
| `react` | `false` | A base ReAct, sem envoltório. |
| `plan-and-execute` | `false` | A base Plan-and-Execute, sem envoltório. |
| `react` | `true` | `wrapWithReflection` dessa base, nome `reflect:react`, teto de reflexões 2. |
| `plan-and-execute` | `true` | `wrapWithReflection` dessa base, nome `reflect:plan-and-execute`, teto de reflexões 2. |
| qualquer outro texto | qualquer | `UnknownStrategyError` com `Estratégia desconhecida: <texto>.` Não chama `run` nem o crítico. |

`maxIterations` passado ao `run` é 8.

## O que o catálogo de produção não faz

- Não registra `reflect:react` nem `reflect:plan-and-execute` como chave. Esses nomes continuam válidos na arena.
- Não publica a estratégia substituta do teste.
- Não muda o contrato de rastro, métricas ou ferramentas.

## Substitutos do ensaio

O teste injeta um mapa em que `react` é uma estratégia cujo `run` devolve o mesmo `answer`, `trace` e `metrics` para a mesma mensagem e não abre rede. Para o caso com reflexão, injeta também um crítico que não abre rede. `reflect: false` não chama esse crítico. `reflect: true` devolve o resultado do envoltório sobre esse substituto.
