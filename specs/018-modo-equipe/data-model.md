# Data Model: Modo equipe

**Feature**: `018-modo-equipe`  
**Persistência**: nenhuma tabela nova. O quadro vive no estado do grafo da equipe e morre com o turno. O evento `handoff` entra no JSON de rastro já persistido.

Contratos: [contracts/team-mode.md](./contracts/team-mode.md), [contracts/chat-http.md](./contracts/chat-http.md), [contracts/trace-handoff.md](./contracts/trace-handoff.md).

---

## ProductionRoute

Acrescentar `team` aos valores já aceitos (`react`, `plan-and-execute`, `reflection`).

| Valor | Significado |
| --- | --- |
| `team` | Modo equipe: supervisor, quadro e no máximo 8 decisões |

Continua de fora: `reflect:react`, `reflect:plan-and-execute`, e qualquer caixa diferente de `team`.

---

## TraceNode

Acrescentar `team`. Os outros valores não mudam.

| Valor | Quem emite nesta feature |
| --- | --- |
| `team` | `handoff`, `plan`, `action` e `observation` produzidos pela rota `team` |
| `router` | Evento `route`, inclusive quando a rota é `team` |

`node` segue opcional no tipo compartilhado com a arena. No rastro do chat ele continua obrigatório.

---

## Blackboard

Quadro de um turno `team`. Não é entidade de store.

| Campo | Tipo | Início | Quem escreve |
| --- | --- | --- | --- |
| `request` | `string` | Mensagem crua do plantonista | Ninguém depois da criação |
| `findings` | `string` | `""` | Só o analista |
| `plan` | `string[]` | `[]` | Só o planejador |
| `incident` | `string` | `""` | Só o executor |

Regras de `applyRoleUpdate`:

- Analista: se `findings` nova é não vazia e já havia texto, concatena com `\n`. Não mexe em `plan` nem em `incident`.
- Planejador: substitui `plan` inteiro. Não mexe nos outros campos.
- Executor: se a nota nova é não vazia e já havia texto, concatena com `\n`. Não mexe em `findings` nem em `plan`.
- Atualização com campo de outro papel é ignorada.

`renderBoard` devolve esse objeto em JSON estável (as quatro chaves, nesta ordem) para o supervisor ler.

O quadro não entra na resposta HTTP. O que o plantonista vê dele é o rastro.

---

## TeamDecision

Decisão do supervisor, antes de virar evento.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `next` | `analista` \| `planejador` \| `executor` \| `encerrar` | Fora disso é decisão inválida |
| `brief` | `string` | Depois de `trim`, comprimento ≥ 1 |

Não há outros campos obrigatórios. Campo extra do modelo não muda o contrato.

---

## HandoffEvent

Variante nova de `TraceEvent`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `type` | `"handoff"` | Fixo |
| `next` | o mesmo enum de `TeamDecision` | Papel ou `encerrar` |
| `brief` | `string` | O mesmo texto não vazio da decisão |
| `node` | `"team"` | Sempre, neste evento |

Só existe depois de uma decisão válida. Não existe para a nona decisão nem para decisão ilegível.

---

## Atualização de papel

O que cada porta devolve para o grafo aplicar.

| Papel | Escrita no quadro | Eventos além do `handoff` |
| --- | --- | --- |
| `analista` | `findings` | Um `action` e um `observation` por ferramenta de leitura chamada. Se houver prosa do analista, um `observation` com esse texto. |
| `planejador` | `plan` com pelo menos um passo não vazio | Um `plan` com esses passos |
| `executor` | `incident` só com nota de texto, quando não há espera | `action` da ferramenta pedida. Em espera de aprovação, sem `observation` de sucesso |

Todos esses eventos saem com `node: "team"`.

---

## Contagem do teto

| Campo de estado | Tipo | Regra |
| --- | --- | --- |
| `handoffs` | inteiro | Começa em 0. Sobe 1 só depois de uma decisão válida, incluindo `encerrar`. Máximo 8. |

Resposta quando `handoffs` já é 8 ao entrar de novo no supervisor: `buildLimitReachedAnswer(8)`.

Resposta quando `next` é `encerrar`: o `brief`.

---

## Erros de domínio

| Classe | Mensagem padrão | HTTP |
| --- | --- | --- |
| `InvalidTeamDecisionError` | `Não foi possível decidir o próximo papel.` | 502 |
| `InvalidTeamRoleError` | `Não foi possível cumprir o papel.` | 502 |

Nenhuma das duas carrega o texto bruto do modelo. `InvalidRouteError` permanece com a mensagem da rota. `ModelUnavailableError` permanece 503. `HumanApprovalRequiredError` não vira HTTP de erro: vira 202.
