# Research: Grafo unificado de produção

**Phase 0 output for** `specs/013-grafo-unificado/plan.md`

---

## Contexto

`POST /chat` entra em `runChat` (`src/services/chat-service.ts`). Hoje, se `strategy` vem ausente, o serviço força `"react"` e chama `resolveChannelStrategy` (`src/agents/index.ts`) **antes** do atalho de mensagem vazia. O catálogo do canal só tem `react` e `plan-and-execute`. `reflect: true` envolve essa base com `wrapWithReflection` (`reflect:react` ou `reflect:plan-and-execute`).

O prompt já passa por `buildContext` (`src/context/context-builder.ts`). O rastro é `TraceEvent` sem etapa (`src/agents/strategy.ts`): `thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`. Não existe evento `route` nem grafo de produção. ReAct e Plan-and-Execute continuam sendo estratégias com `run(prompt)`. Plan-and-Execute já é um `StateGraph`; o crítico e o extrator de aprendizado já usam `withStructuredOutput` + Zod.

A spec troca o default ReAct por um caminho único: contexto → roteador → exatamente uma de três rotas → resposta. `strategy` conhecida vira override. Decisão inválida é 502. Mensagem vazia não valida estratégia.

---

## Decisão 1: `StateGraph` em `src/agents/production-graph.ts`

**Decisão**: Um grafo por turno, compilado dentro de `runProductionGraph`, com nós nomeados `context`, `router`, `react`, `plan-and-execute`, `reflection` e `response`. Arestas: `START → context → router`, aresta condicional do roteador para exatamente um nó de estratégia, depois `→ response → END`.

**Rationale**: A spec pede essa ordem e esses nomes. O projeto já usa `StateGraph` em Plan-and-Execute (`@langchain/langgraph`). Um grafo só no chat deixa arena e bench chamando `strategy.run` direto.

**Alternatives considered**:

- `if/else` no `chat-service` sem grafo — não materializa os nós nem a aresta condicional.
- Fundir os grafos internos de ReAct e Plan-and-Execute neste grafo — reescreve estratégias estáveis e mistura arena com produção.
- Grafo singleton compilado no boot — opções por turno (`userId`, registry, critic, router) mudam; compilar por chamada segue o padrão de `createPlanExecuteGraph`.

---

## Decisão 2: I/O fica no serviço; o nó `context` só monta o prompt

**Decisão**: `runChat` continua lendo histórico, resumo e memória. O nó `context` recebe as seções e os budgets já resolvidos e chama `buildContext`. O roteador lê só `message` (texto atual). A estratégia recebe `built.prompt`. O grafo devolve `built` para o serviço calcular `contextBreakdown` como hoje.

**Rationale**: Constituição II — lógica nova de decisão é pura; I/O de store não entra no nó. A ordem da spec permanece dentro do grafo. O roteador não reprocessa o prompt orçado (assumption da spec).

**Alternatives considered**:

- Montar o contexto no serviço e deixar o nó `context` como pass-through — o nó não faz o trabalho que o nome promete.
- Recall e resumo dentro do nó — o grafo passaria a conhecer stores e a borda de conversa.

---

## Decisão 3: Porta `ProductionRouter` + `withStructuredOutput`

**Decisão**: Interface injetável:

```ts
type RouteDecision = {
  route: "react" | "plan-and-execute" | "reflection";
  reason: string;
  llmCalls: number;
  promptTokens: number;
};

type ProductionRouter = {
  decide(message: string): Promise<RouteDecision>;
};
```

`createLlmRouter()` usa `createModel().withStructuredOutput(schema, { includeRaw: true })`. Schema Zod: `route` enum das três rotas; `reason` string. Depois do parse, `reason` trimado vazio ou rota fora do enum vira erro de rota — não segue para a estratégia. `llmCalls` = 1. `promptTokens` = `readPromptTokens(raw)`.

O objeto parseado sozinho não carrega `usage_metadata` (o crítico hoje lê tokens em cima do objeto estruturado e pode contar 0). `includeRaw: true` é o que expõe a mensagem bruta para `readPromptTokens`, já usado em `src/context/tokens.ts`.

Instruções do roteador: constante exportada `ROUTER_PROMPT` com a tabela da spec (três linhas, nenhuma quarta rota). Teste afirma que o texto contém as três associações. A suíte não chama o modelo.

Override: o nó `router` **não** chama `decide`. Grava rota, `override: true`, motivo exato `Estratégia informada no pedido.` e `llmCalls`/`promptTokens` do roteador em 0.

**Rationale**: Spec pede decisão estruturada `(route, reason)`, tabela no prompt, custo só quando não há override, e teste sem rede. A porta repete o padrão do `Critic` injetável.

**Alternatives considered**:

- Classificar por palavras-chave no lugar do modelo — a spec pede o roteador com a tabela nas instruções; o substituto determinístico cobre o teste.
- `withStructuredOutput` sem `includeRaw` — perde os tokens de prompt da decisão.
- Chamar o modelo mesmo no override e descartar a rota — gasta uma consulta que a spec proíbe (SC-004).

---

## Decisão 4: `node` opcional no tipo; carimbo na fronteira do grafo

**Decisão**: Acrescentar ao `TraceEvent`:

- variante `{ type: "route"; route; reason; override: boolean }`;
- campo opcional `node?: "context" | "router" | "react" | "plan-and-execute" | "reflection" | "response"` em todo evento.

`stampTrace(events, node)` devolve a lista com `node` preenchido. O nó da estratégia carimba o rastro devolvido por `run` com o nome da **rota efetiva** (não `reflect:react`). O evento `route` nasce com `node: "router"` e fica antes dos eventos da estratégia. `messagesToTrace`, arena e bench não passam a exigir `node`.

`formatTrace` ganha um ramo `route` para não omitir o evento se alguém imprimir o rastro do chat.

O nó `context` não emite evento. O nó `response` não consulta modelo e não reescreve `answer`. Não acrescenta evento `answer` (a estratégia já o traz; o carimbo usa a rota). Eventos `summarize` continuam sendo empurrados no `runChat`, com `node: "response"`.

Mensagem vazia: `buildEmptyInputResult()` permanece sem `node` (arena). O atalho do chat carimba o `answer` com `response` e não cria `route`.

**Rationale**: Tornar `node` obrigatório quebraria todo literal de rastro da arena. A spec só obriga `node` no rastro do chat.

**Alternatives considered**:

- Cada estratégia recebe o nome do nó e grava sozinha — arena passaria a emitir `node` e o carimbo se espalharia.
- Evento extra do nó `context` — a spec não exige; aumenta o rastro sem decisão observável.

---

## Decisão 5: Rota `reflection` reusa `wrapWithReflection` sobre ReAct

**Decisão**: Função pura `resolveProductionStrategy({ route, reflect, registry, critic })`:

| Rota efetiva | `reflect` | O que executa | `node` no rastro da estratégia |
| --- | --- | --- | --- |
| `react` | false / ausente | base `react` do registry | `react` |
| `react` | true | `wrapWithReflection` dessa base, nome interno `reflect:react` | `react` |
| `plan-and-execute` | false / ausente | base do registry | `plan-and-execute` |
| `plan-and-execute` | true | wrap dessa base, nome interno `reflect:plan-and-execute` | `plan-and-execute` |
| `reflection` | qualquer | wrap da base `react`, um ciclo, teto `maxReflections` 2 | `reflection` |

`reflection` não é chave do `channelStrategies`. Nomes `reflect:react`, `reflect:plan-and-execute`, `""` e caixa diferente continuam rejeitados no chat. Arena não muda.

Registry injetado precisa ter `react` e `plan-and-execute`. Ausência da base exigida pela rota é defeito de composição (erro claro antes do `run`), não 422 de nome do plantonista. Produção usa `channelStrategies`.

**Rationale**: A spec fixa três rotas e manda a reflexão do canal (teto 2) sobre ReAct quando a rota é `reflection`, sem segundo ciclo. O nome interno `reflect:react` já existe; o plantonista vê `node: "reflection"`.

**Alternatives considered**:

- Nova `StrategyName` `"reflection"` — mexe no enum da arena sem necessidade.
- `reflect: true` com rota `reflection` empilhar outro crítico — a spec proíbe o segundo ciclo.
- Omitir `strategy` continuar forçando ReAct — contradiz FR-012.

---

## Decisão 6: Ordem de falhas no `runChat` e erro 502

**Decisão**:

1. Mensagem vazia ou só espaços: se `conversationId` vier e não existir, 404 (contrato da conversa, já testado). Senão 200 com o aviso vazio, `node: "response"`, sem 422, sem roteador e sem estratégia — mesmo com `strategy` desconhecida. O teste atual que espera 422 nesse caso muda.
2. Mensagem não vazia e `strategy` fora das três rotas: `UnknownStrategyError` **antes** de `lastMessages`, para o 422 continuar ganhando de um `conversationId` inexistente.
3. `conversationId` inexistente: 404.
4. Grafo dentro do `Promise.race` já existente (timeout 504 cobre o roteador).
5. Decisão inválida: nova `InvalidRouteError` com mensagem fixa `Não foi possível decidir a rota.` O `server.ts` mapeia para **502** `{ message }`. Sem evento `route`, sem `run` de estratégia. O texto do modelo não vaza no corpo.

Zod do body não vira enum: string desconhecida continua 422, não 400. `""` continua 422.

**Rationale**: Fecha FR-009, FR-010 e FR-013 sem desfazer 404 nem o teste “unknown strategy wins over unknown conversationId”.

**Alternatives considered**:

- 422 também para rota inválida do modelo — mistura nome enviado pelo plantonista com falha da decisão automática.
- Validar estratégia antes do atalho de mensagem vazia — é o código de hoje e a spec revoga isso.

---

## Decisão 7: Métricas somam a decisão automática

**Decisão**: `llmCalls` e `promptTokens` do turno = decisão do roteador (0 no override) + métricas da estratégia. `latencyMs` mede o `invoke` do grafo inteiro (contexto, roteador, estratégia, resposta). `historyMessages` e `contextBreakdown` continuam no serviço, depois do grafo.

**Rationale**: SC-003 e SC-004. O timeout já envolve a chamada única que substitui `strategy.run`.

**Alternatives considered**:

- Contar o roteador só em `llmCalls` e ignorar tokens — a spec inclui o tamanho do pedido da decisão.
- Relógio só da estratégia — esconderia a latência do roteador dentro do mesmo turno.

---

## Decisão 8: Testes sem rede, com roteador injetado

**Decisão**: `createApp` / `runChat` ganham `router?: ProductionRouter`, no mesmo estilo de `registry` e `critic`. Testes de chat que omitem `strategy` passam um roteador fixo. Sem injeção, produção usa `createLlmRouter()`. Não há default silencioso para ReAct.

Testes novos:

- puros: carimbo, evento `route`, `resolveProductionStrategy`, texto de `ROUTER_PROMPT`, rejeição de motivo vazio;
- grafo com fakes: uma estratégia, ordem do rastro, override não chama `decide`, decisão inválida não chama `run`, `reflect` não duplica ciclo na rota `reflection`;
- HTTP: 502, 422, override, mensagem vazia com `strategy` desconhecida agora 200.

`npm run typecheck` e `npm test` verdes. Arena e bench sem mudança de comportamento.

**Rationale**: Constituição V e SC-006. Os testes atuais que omitem `strategy` e esperam o fake `react` passariam a abrir OpenRouter se o roteador não for injetado.

**Alternatives considered**:

- Fallback de teste para ReAct quando não há router — reintroduz o default que a spec remove e mascara regressão.
- Teste de integração com OpenRouter — fora do contrato de substituto determinístico.
