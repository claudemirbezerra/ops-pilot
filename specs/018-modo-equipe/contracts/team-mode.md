# Contract: Modo equipe

Grafo e portas em `src/team/`. Encaixe no grafo de produção. Modelo de dados em [data-model.md](../data-model.md). HTTP em [chat-http.md](./chat-http.md). Texto do rastro em [trace-handoff.md](./trace-handoff.md).

## Estratégia

`teamStrategy.name` é `team`. `channelStrategies.team` aponta para ela. Arena e bench não a listam.

`resolveProductionStrategy({ route: "team", reflect: true | false })` devolve o registry `team` sem crítico e sem segundo ciclo. As rotas `react`, `plan-and-execute` e `reflection` continuam como já estão.

O nó `team` do grafo de produção chama essa estratégia com o prompt já montado e com `requestMessage` igual à mensagem crua. `stampTrace` segue carimbando a rota `team`.

## Estado e arestas

Estado mínimo do grafo da equipe: `prompt`, `blackboard`, `handoffs`, `trace`, `answer`, `llmCalls`, `promptTokens`, `modelUsed`, `pendingApproval`, `done`.

```text
START → supervisor
supervisor -- done --> END
supervisor -- analista --> analista → supervisor
supervisor -- planejador --> planejador → supervisor
supervisor -- executor, sem espera --> executor → supervisor
supervisor -- executor, com espera --> executor → END
```

`recursionLimit` da invocação: `TEAM_MAX_HANDOFFS * 2 + 4`.

## Supervisor

Porta:

```ts
type TeamSupervisor = {
  decide(input: {
    prompt: string;
    blackboard: Blackboard;
  }): Promise<{
    next: "analista" | "planejador" | "executor" | "encerrar";
    brief: string;
    llmCalls: number;
    promptTokens: number;
    modelUsed?: string;
  }>;
};
```

Adaptador de produção: `withStructuredOutput` no schema `{ next, brief }`, opção `{ includeRaw: true }`. O usuário do modelo recebe `renderBoard(blackboard)` junto do prompt do turno.

Ao entrar no nó:

1. Se `handoffs >= 8`, não chama `decide`. `answer` = `buildLimitReachedAnswer(8)`. `done`.
2. Chama `decide`. `ModelUnavailableError` sobe. Outra falha de parse, `next` inválido ou `brief` vazio depois de `trim` lança `InvalidTeamDecisionError` sem `handoff` e sem papel.
3. Acrescenta o evento `handoff` (`node: "team"`) e soma 1 em `handoffs`. Soma `llmCalls` e `promptTokens`.
4. `encerrar`: `answer` = `brief`, `done`, sem papel.

## Papéis

Portas injetáveis, uma por papel. Cada uma recebe `prompt`, `brief` e `blackboard` e devolve a atualização da [data-model](../data-model.md), os eventos, as métricas e, no executor, `pendingApproval` opcional.

Allowlist (nomes exatos, nada mais é invocado):

| Papel | Ferramentas |
| --- | --- |
| `analista` | `list_alertas`, `list_incidents`, `consultar_runbook`, `check_provider_status` |
| `planejador` | nenhuma |
| `executor` | `open_incident`, `resolver_incident` |

Frases que o prompt do papel contém, literais:

- Analista: `Relate apenas fatos. Não proponha abertura, resolução, plano de passos nem próxima ação.`
- Planejador: `Não chame ferramentas.`
- Executor: `Não contorne a aprovação humana.`

Planejador de produção: `withStructuredOutput({ steps: string[] })`. Zero passos, ou passo vazio depois de `trim`, lança `InvalidTeamRoleError`. Não há `bindTools`.

Executor de produção: para `open_incident` e `resolver_incident`, lançar `HumanApprovalRequiredError` antes de executar a ferramenta. O nó preenche `pendingApproval` com `describePendingApproval`, inclui o `action` no rastro (além do `handoff` que já está lá) e termina o grafo. O store permanece sem essa abertura ou resolução.

Nome de ferramenta fora da allowlist: não invocar; `observation` com o texto `Ferramenta indisponível para este papel.`

## Custo

Cada `decide` aceito conta 1 consulta e os tokens de prompt dela. Cada papel soma as próprias consultas. A parada por teto não consulta o supervisor de novo. Override `team` não soma a consulta do roteador de produção.

## Fora deste contrato

- Retomar o quadro depois que o plantonista aprova ou nega.
- Quadro no turno seguinte.
- Arena, bench e `resolveChannelStrategy`.
