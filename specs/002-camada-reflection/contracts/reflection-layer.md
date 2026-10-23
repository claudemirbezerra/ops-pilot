# Contract: Reflection Layer

Envoltório interno sobre qualquer `ReasoningStrategy` base. A arena e os testes consomem o mesmo `StrategyResult` do núcleo (`001` / [reasoning-strategy](../../001-nucleo-raciocinio/contracts/reasoning-strategy.md)).

## wrapWithReflection

| Entrada | Forma |
|---------|--------|
| `base` | Estratégia com `name` `"react"` ou `"plan-and-execute"` |
| `critic` | Porta `evaluate({ input, answer, observations }) → CritiqueDecision \| falha` |
| `name` | `"reflect:react"` ou `"reflect:plan-and-execute"` |

Retorno: objeto com `name` e `run(input, options)` compatível com o contrato comum, onde `options` inclui `maxIterations` e `maxReflections` (inteiro ≥ 1).

## CritiqueDecision

| Campo | Forma |
|-------|--------|
| `approved` | boolean |
| `feedback` | string |

## Ciclo de `run`

1. Se `input` em branco: devolver o resultado de pedido vazio da base (ou o equivalente `buildEmptyInputResult`), **sem** chamar o crítico.
2. Medir `latencyMs` do ciclo inteiro.
3. Executar a base com o `input` corrente e `maxIterations`.
4. Se a base falhou de modo que não há resposta candidata a criticar (ex.: indisponibilidade já refletida no resultado da base e política de não inventar crítica na primeira falha): devolver esse resultado mesclado às métricas/rastro já acumulados, sem crítico.
5. Caso contrário, chamar o crítico com pedido, resposta e observações (`trace` filtrado a `type === "observation"`).
6. Acrescentar evento `critique` ao rastro acumulado.
7. Se `approved`: garantir último evento `answer`; devolver.
8. Se crítico indisponível: registrar crítica legível de falha; garantir último `answer` = última resposta da base; devolver.
9. Se reprovado e ainda há regenerações (`maxReflections` não esgotado): montar novo `input` com feedback (padrão se vazio), decrementar regenerações restantes, voltar ao passo 3.
10. Se reprovado e teto esgotado: garantir último `answer` = última resposta da base; devolver.

## Métricas

| Campo | Regra |
|-------|--------|
| `llmCalls` | Soma dos `llmCalls` de cada `base.run` + 1 por avaliação real do crítico de produção. Stubs de teste podem reportar 0 no crítico. |
| `latencyMs` | Tempo de parede do envoltório. |

## Invariantes

- Cada avaliação do crítico (sucesso ou indisponibilidade registrada) produz exatamente um evento `critique`.
- Com crítico que sempre reprova e `maxReflections = 2`, há no máximo 2 regenerações após a passagem inicial.
- Duas execuções offline com os mesmos stubs e o mesmo teto produzem o mesmo formato de rastro (mesma sequência de tipos e a mesma regra de parada).
