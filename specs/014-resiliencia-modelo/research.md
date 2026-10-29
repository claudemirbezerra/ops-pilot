# Research: Resiliência de modelo

**Phase 0 output for** `specs/014-resiliencia-modelo/plan.md`

---

## Contexto

Hoje `src/agents/model.ts` cria um único `ChatOpenAI` com `OPENROUTER_MODEL`, `timeout: MODEL_REQUEST_TIMEOUT_MS` e `maxRetries: MODEL_MAX_RETRIES` (2). Não há reserva. Falhas de modelo em ReAct / Plan-and-Execute são engolidas no `catch` e viram `answer` com `MODEL_UNAVAILABLE_ANSWER` em HTTP **200**. Embedding já mapeia `EmbeddingUnavailableError` → 503; modelo não.

A spec pede: env `OPENROUTER_MODEL_FALLBACK`, `withRetry` no principal, `withFallbacks([reserva])`, evento `fallback`, `metrics.modelUsed`, e 503 se nada funcionar.

APIs confirmadas em `@langchain/core` (já instalado):

- `runnable.withRetry({ stopAfterAttempt?: number })` → `RunnableRetry`
- `runnable.withFallbacks([other] | { fallbacks: [...] })` → `RunnableWithFallbacks`

---

## Decisão 1: Estender `model.ts` (não criar `models.ts`)

**Decisão**: Manter o módulo `src/agents/model.ts` como fábrica única. O enunciado “models.ts” é o mesmo ponto de criação.

**Rationale**: Spec Assumptions; evita dois módulos e importa quebrados.

**Alternatives considered**:
- Renomear para `models.ts` — churn de imports sem ganho.
- Wrapper só em `runChat` — estratégias/arena/roteador/sumarizador continuariam sem resiliência (quebra FR-009).

---

## Decisão 2: Composição `withRetry` → `withFallbacks`; `maxRetries: 0` no ChatOpenAI

**Decisão**:

1. Instanciar `ChatOpenAI` do principal e do reserva (se houver) com **`maxRetries: 0`** (o SDK não retenta por baixo).
2. Principal: `primary.withRetry({ stopAfterAttempt: MODEL_MAX_RETRIES + 1 })` (alinhado ao padrão atual: 1 tentativa + 2 retries ≈ 3 tentativas; documentar constante).
3. Se `OPENROUTER_MODEL_FALLBACK` trim não vazio e distinto ou não: `retriedPrimary.withFallbacks([reserve])` (reserva **sem** o mesmo `withRetry` obrigatório no MVP — uma passagem no reserva basta; opcionalmente o reserva pode ter `maxRetries: 0` igual).
4. Sem fallback env: devolver só o principal com `withRetry`.

**Rationale**: Spec pede explicitamente `withRetry` no primário e `withFallbacks{[reserva]}`. Manter `maxRetries: 2` **e** `withRetry` dobraria retries antes do reserva. `withFallbacks` só dispara quando o runnable primário **lança** após esgotar.

**Alternatives considered**:
- Só `maxRetries` do SDK + `withFallbacks` — não honra o enunciado `withRetry`.
- `modelFallbackMiddleware` / `createAgent` (docs novas LangChain) — stack do projeto usa `ChatOpenAI` + estratégias atuais, não `createAgent`.
- Lista de vários reservas — fora de escopo (um env).

---

## Decisão 3: Observabilidade — wrappers leves + getters de sessão

**Decisão**: `RunnableWithFallbacks` não expõe “quem atendeu”. Envolver principal e reserva (ou o runnable composto) com `RunnableLambda` / subclass mínima que, no sucesso do invoke:

- grava `modelUsed` = id configurado daquele elo;
- se o elo for o reserva, marca `fallbackOccurred = true`.

A fábrica devolve, além do runnable (ou no objeto `LimitedModel` estendido):

- `getModelUsed(): string | undefined`
- `didFallback(): boolean`
- `consumeFallbackEvent(): TraceEvent | undefined` (ou helpers puros `buildFallbackEvent(from, to)`)

Callers (`createCountingModel` path, roteador, etc.) após invoke bem-sucedido:

- setam `metrics.modelUsed`;
- se `didFallback()`, prepend/append evento `{ type: "fallback", from, to, node? }` no rastro do turno.

Para o **fechamento do turno de chat**, `modelUsed` = último modelo que respondeu com sucesso na sessão da fábrica usada pela estratégia (assumption da spec). Se várias fábricas forem criadas no mesmo turno (roteador + estratégia), o 200 do chat usa o `modelUsed` da estratégia que produziu a `answer` (roteador pode omitir ou o grafo pode preferir o da estratégia — ver Decisão 6).

**Rationale**: Cumpre FR-005/FR-006 sem depender de LangSmith; testável com fakes.

**Alternatives considered**:
- Só callbacks LangChain genéricos — mais frágeis e menos tipados para nosso `TraceEvent`.
- Reimplementar try/catch manual sem `withFallbacks` — divergiria do enunciado.

---

## Decisão 4: Tipagem — runnable composto vs `ChatOpenAI`

**Decisão**:

- `createModel` passa a devolver o **runnable resiliência** (tipo `Runnable` / união documentada no contrato), não necessariamente `ChatOpenAI` cru.
- Onde a API exige `BaseChatModel` (ex.: `createReactAgent({ llm })`), usar o runnable se o prebuilt aceitar `LanguageModelLike` / `Runnable` (verificar na implementação; se o tipo apertar, cast documentado ou adapter fino).
- `withStructuredOutput`: **não** chamar no wrapper de fallbacks. Padrão: `structuredPrimary = primaryChat.withStructuredOutput(...)`, `structuredReserve = reserveChat.withStructuredOutput(...)`, depois `structuredPrimary.withRetry(...).withFallbacks([structuredReserve])` (retry no structured primary). Helper interno `createStructuredModel(schema, env)` evita duplicar isso no roteador.

**Rationale**: `withStructuredOutput` é método de chat model; `RunnableWithFallbacks` não o expõe.

**Alternatives considered**:
- Manter `createModel(): ChatOpenAI` e só documentar fallback “manual” — rejeitado pelo enunciado.
- Um único structured no composto — impossível na API atual.

---

## Decisão 5: `ModelUnavailableError` → 503; parar soft-200

**Decisão**:

- Nova classe `ModelUnavailableError extends DomainError` com mensagem estável (ex.: `Modelo indisponível.`).
- Quando o runnable resiliência esgota (principal ± reserva), a fábrica ou o caller **lança** `ModelUnavailableError` (envolver o erro original se útil para log, sem ecoar na borda).
- `server.ts`: `instanceof ModelUnavailableError` → `503 { message }` (mesmo formato de embedding).
- `react.ts` / `plan-and-execute.ts`: no `catch`, **rethrow** se `ModelUnavailableError` (e idealmente qualquer falha pós-resiliência do modelo); não devolver `MODEL_UNAVAILABLE_ANSWER` em 200 para esse caso.
- `MissingModelConfigError` permanece (config); não misturar com indisponibilidade runtime.
- `reflection.ts`: hoje trata `MODEL_UNAVAILABLE_ANSWER` como rejeição; ajustar testes/fluxo para erro lançado ou manter string só se algum caminho legado ainda a produzir — preferir não produzir em produção após esta feature.

**Rationale**: Spec US4 / FR-007; soft-200 atual contradiz o critério de sucesso SC-004.

**Alternatives considered**:
- Continuar 200 com texto de indisponibilidade — rejeitado pela spec.
- 502 — já usado para rota inválida; 503 é o pedido explícito.

---

## Decisão 6: Onde carimbar `modelUsed` / `fallback` no chat

**Decisão**:

1. Estratégias que usam `createCountingModel` / modelo resiliência preenchem `metrics.modelUsed` e inserem evento `fallback` no `trace` quando `didFallback()`.
2. `runChat` / grafo **preservam** esses campos ao agregar métricas (não dropar `modelUsed` ao montar `contextBreakdown` / `historyMessages`).
3. Pedido vazio: sem consulta → sem `modelUsed` e sem `fallback` (comportamento atual).
4. Roteador LLM: se fizer fallback próprio, pode emitir `fallback` com `node: "router"`; `metrics.modelUsed` do **200** permanece o da estratégia que gerou a resposta (último sucesso da estratégia), salvo se o turno falhar antes — alinhado à assumption da spec.

**Rationale**: Um campo `modelUsed` no JSON final; eventos `fallback` podem repetir se router e estratégia trocarem (aceitável; “pelo menos um” na spec para turno via reserva da resposta).

**Alternatives considered**:
- Só o serviço de chat inspeciona a fábrica global — quebra com múltiplas instâncias por turno.
- Métrica por etapa — fora do MVP.

---

## Decisão 7: Testes sem OpenRouter

**Decisão**: Em `model.test.ts`, injetar runnables/`ChatOpenAI` substitutos (ou factory interna `composeResilientModel({ primary, reserve? })` pura) que falham/sucedem de forma determinística. HTTP: `createApp` com registry fake que lança `ModelUnavailableError` → 503; fake que devolve metrics/trace com `modelUsed` / `fallback` → 200.

**Rationale**: Constituição V; padrão do repo.

**Alternatives considered**:
- Teste de integração real OpenRouter — flaky e exige secret.

---

## Resolução de clarificações

Nenhum `NEEDS CLARIFICATION` restante no Technical Context do plan. Desconhecidos de API LangChain e conflito soft-200 vs 503 resolvidos pelas decisões acima.
