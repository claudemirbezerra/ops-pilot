# Research: Modo equipe

**Phase 0 output for** `specs/018-modo-equipe/plan.md`

---

## Contexto

`POST /chat` já percorre `runProductionGraph`: `context` → `router` → uma de `react`, `plan-and-execute`, `reflection` → `response`. `ProductionRoute` e o Zod do roteador listam só essas três. `ROUTER_PROMPT` termina com "Não invente uma quarta rota." `strategy` fora da lista é 422 antes do grafo. `reflect: true` envolve `react` e `plan-and-execute`; a rota `reflection` envolve ReAct.

Ferramentas nascem em `createOpsTools`. `open_incident` e `resolver_incident` estão em `TOOLS_REQUIRING_HUMAN_APPROVAL`. ReAct e Plan-and-Execute lançam `HumanApprovalRequiredError` antes de invocar essas duas; o HTTP responde 202 e o cliente mostra o cartão. O rastro é `TraceEvent`. `formatTrace` (servidor) e `formatTraceEvent` (`web/src/lib/trace.ts`) não conhecem `handoff`. `TracePanel` já mostra `event.type` e o texto formatado. O payload de request/aprovação guarda o evento como JSON livre (`PersistedTraceEvent`), sem migração.

`DEFAULT_MAX_ITERATIONS` em `runChat` já é 8, mas conta iterações de ReAct, não decisões de supervisor. `buildLimitReachedAnswer(8)` produz exatamente `Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).`

A spec pede a quarta rota `team`, um supervisor com decisão `{ next, brief }` sobre um quadro no estado, três papéis com ferramentas diferentes, evento `handoff` em ver raciocínio e teto 8.

---

## Decisão 1: Grafo da equipe em `src/team/`, nó fino no grafo de produção

**Decisão**: `teamStrategy` é uma `ReasoningStrategy` de nome `team`, registrada em `channelStrategies`. O grafo de produção ganha o nó `team`, que chama `runStrategy(state, "team")` como os outros. O loop supervisor → papel → supervisor vive num `StateGraph` compilado dentro de `teamStrategy.run`. `resolveProductionStrategy` devolve essa estratégia sem `wrapWithReflection`, mesmo com `reflect: true`.

**Rationale**: A spec pede a pasta `src/team/` e a rota `team` no mesmo caminho do chat. O grafo de produção já escolhe exatamente uma estratégia. Aninhar o ciclo evita reescrever ReAct e Plan-and-Execute e impede que `reflect` crie um segundo ciclo em cima da equipe.

**Alternatives considered**:

- Colocar analista, planejador e executor como nós do grafo de produção — mistura o quadro com contexto, roteador e as outras rotas.
- Tratar `team` só como override, sem entrar no enum do roteador — a spec inclui a quarta linha da tabela.
- Envolver `team` com o crítico quando `reflect` é verdadeiro — a spec proíbe esse ciclo extra.

---

## Decisão 2: Quadro no estado do grafo da equipe, não no SQLite

**Decisão**: O estado do `StateGraph` da equipe carrega o quadro. Forma: `request` (mensagem crua do plantonista), `findings` (string), `plan` (lista de strings), `incident` (string). Começa com `findings` vazia, `plan` vazio e `incident` vazio. Não há tabela nem coluna nova. O turno seguinte não reaproveita o quadro; o histórico da conversa continua pelo caminho atual.

`runStrategy` passa a enviar `requestMessage: state.message` nas opções da estratégia. As outras estratégias ignoram o campo. O prompt já montado (`state.prompt`) segue como entrada de `run`, para o supervisor e os papéis verem resumo, janela e memória.

`applyRoleUpdate` é puro: analista só substitui `findings` (acumula com quebra de linha se já havia texto); planejador só substitui `plan`; executor só acumula `incident`. Campos dos outros papéis são ignorados.

**Rationale**: A spec pede o quadro no estado do turno e proíbe cada papel de escrever a parte alheia. Persistência nova não foi pedida. A mensagem crua não está separada dentro do prompt orçado; por isso o grafo de produção a entrega à parte.

**Alternatives considered**:

- Guardar o quadro na conversa — vaza memória de um turno para o outro e exige schema.
- Deixar o analista devolver um plano e filtrar por texto — não é testável. O merge puro é.
- Usar o prompt inteiro como `request` — mistura orçamento de contexto com o pedido.

---

## Decisão 3: Porta do supervisor e `withStructuredOutput({ next, brief })`

**Decisão**: Porta injetável `TeamSupervisor.decide({ prompt, blackboard })`. O adaptador de produção usa `createModel().withStructuredOutput(schema, { includeRaw: true })`. Schema Zod: `next` enum `analista | planejador | executor | encerrar`; `brief` string. Depois do parse, `brief` trimado vazio ou `next` fora do enum lança `InvalidTeamDecisionError` (`Não foi possível decidir o próximo papel.`) antes de existir `handoff` e antes de qualquer papel. `ModelUnavailableError` é relançado (503), não convertido em 502. `llmCalls` = 1 e `promptTokens` = `readPromptTokens(raw)` só quando a decisão é aceita.

O grafo emite o `handoff` depois da validação. `encerrar` grava a resposta como o `brief` e vai para `END` sem papel.

**Rationale**: Igual ao roteador, que já precisa de `includeRaw` para contar tokens. A spec fixa os dois campos e a mensagem 502. Diferente do roteador atual, falha de modelo não vira decisão inválida: o chat já mapeia `ModelUnavailableError` para 503.

**Alternatives considered**:

- Classificar o próximo papel por palavra-chave — a spec pede saída estruturada; o teste usa a porta falsa.
- Engolir qualquer erro como 502 — esconde modelo indisponível.
- Deixar o papel emitir o `handoff` — a decisão ilegível não pode gerar evento de sucesso.

---

## Decisão 4: Allowlist por papel e portão antes da invocação

**Decisão**: Os nomes permitidos são constantes puras.

- Analista: `list_alertas`, `list_incidents`, `consultar_runbook`, `check_provider_status`.
- Planejador: lista vazia. Saída estruturada `{ steps: string[] }`, cada passo trimado e não vazio, pelo menos um. Evento `plan` com esses passos. Lista inválida → `InvalidTeamRoleError` (`Não foi possível cumprir o papel.`).
- Executor: `open_incident`, `resolver_incident`.

O adaptador filtra `createOpsTools` por esses nomes. Nome fora da lista não é invocado; a observação é `Ferramenta indisponível para este papel.` Se a ferramenta do executor está no portão humano, o adaptador lança `HumanApprovalRequiredError` antes de chamar a função, no mesmo ponto em que Plan-and-Execute já faz isso. O nó do executor converte isso em `pendingApproval` e o grafo vai para `END`. O store não abre nem resolve incidente. Negar continua no fluxo de aprovação já existente; a equipe não retoma o quadro.

Instruções obrigatórias, contidas no prompt de cada papel:

- Analista: `Relate apenas fatos. Não proponha abertura, resolução, plano de passos nem próxima ação.`
- Planejador: `Não chame ferramentas.`
- Executor: `Não contorne a aprovação humana.`

**Rationale**: A spec separa leitura, plano e incidente. O portão já existe; um caminho que chamasse `store.openIncident` seria o bypass proibido. Prompts fixos tornam a proibição conferível sem o modelo.

**Alternatives considered**:

- Dar ao executor também `list_incidents` — a spec limita o papel a incidentes de ação; o id vem do quadro.
- Confiar no texto do modelo para não propor — o teste não controla o modelo. A allowlist e o merge do quadro controlam.
- Tratar aprovação como 502 — o chat já usa 202 e o cartão.

---

## Decisão 5: Teto 8 no grafo, não em `DEFAULT_MAX_ITERATIONS`

**Decisão**: Constante `TEAM_MAX_HANDOFFS = 8`. O nó do supervisor, ao entrar com `handoffs >= 8`, não chama `decide`, não emite `handoff` e grava `buildLimitReachedAnswer(8)`. A oitava decisão ainda acontece: se for um papel, o papel executa e a volta ao supervisor cai no teto; se for `encerrar`, a resposta é o `brief`. `recursionLimit` do grafo da equipe: `TEAM_MAX_HANDOFFS * 2 + 4` (20).

**Rationale**: Os dois números 8 medem coisas diferentes. Reusar a constante do ReAct faria o teto da equipe mudar se o chat mudasse. `buildLimitReachedAnswer(8)` já é a frase da spec. O limite de recursão do LangGraph (padrão 25) cobriria 17 passos, mas o valor explícito evita corte silencioso.

**Alternatives considered**:

- Parar antes do oitavo papel — contradiz o cenário em que a oitava decisão executa o papel.
- Contar só papéis e não o `encerrar` — a spec conta decisões do supervisor, e `encerrar` é uma delas.

---

## Decisão 6: Evento `handoff` nos dois formatadores

**Decisão**: Nova variante `{ type: "handoff"; next; brief; node?: TraceNode }` com `node: "team"` no construtor puro. `TraceNode` e `ProductionRoute` ganham `team`. `StrategyName` ganha `team`.

`formatTrace` (servidor, arena e log):

```text
[handoff]
analista: Ler os alertas em disparo.
```

`formatTraceEvent` (ver raciocínio): `analista: Ler os alertas em disparo.` O painel já mostra o tipo `handoff` ao lado. Sem componente novo.

Chamadas de ferramenta da equipe usam os eventos `action` e `observation` já existentes. O carimbo `node: "team"` é posto pela equipe e de novo por `stampTrace` no grafo de produção.

**Rationale**: Ver raciocínio é `formatTraceEvent` mais o rótulo `event.type`. Os dois formatadores precisam do caso novo senão o TypeScript deixa de fechar o `switch`. O payload JSON já aceita o evento.

**Alternatives considered**:

- Reusar o evento `route` para a passagem de bastão — `route` é a escolha do roteador de produção, com `override`.
- Painel específico de equipe — a spec pede renderizar o evento no painel atual.

---

## Decisão 7: Quarta linha do roteador, sem quinta rota

**Decisão**: `PRODUCTION_ROUTES` e o Zod de `createLlmRouter` passam a incluir `team`. `ROUTER_PROMPT` usa a tabela de quatro linhas da spec, troca "três rotas" por "quatro rotas" e termina com `Não invente uma quinta rota.` O teste que hoje exige "Não invente uma quarta rota" muda para a quinta. Arena e bench não registram `team`. `resolveChannelStrategy` não aprende a envolver `team`; o chat não usa essa função.

**Rationale**: Override e 422 já dependem de `isProductionRoute`. Incluir `team` nesse conjunto faz `strategy: "team"` funcionar e mantém `Team` como 422, sem ramo novo em `runChat`.

**Alternatives considered**:

- Aceitar `team` só no serviço e não no roteador — o substituto do roteador não conseguiria devolver a rota.
- Atualizar a spec 013 no lugar — spec histórica; esta feature é o delta.
