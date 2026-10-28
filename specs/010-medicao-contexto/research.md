# Research: Medição de contexto

**Phase 0 output for** `specs/010-medicao-contexto/plan.md`

---

## Contexto

O `/chat` já compõe prompt com histórico (`renderHistoryPrompt`) e, opcionalmente, memória (`renderMemoryPrompt`), e devolve `metrics` (`llmCalls`, `latencyMs`, `historyMessages`). As estratégias contam invokes via `createCountingModel` / estado LangGraph, mas **não** leem usage do provedor. Esta feature fecha: estimativa chars÷4, `promptTokens` real agregado no turno, `contextBreakdown` estimado por fonte, e ensaio `conversa-longa.sh`.

---

## Decisão 1: API pura em `src/context/tokens.ts`

**Decisão**:

```ts
/** Divisão inteira: Math.floor(text.length / 4). "" → 0. */
function estimateTokens(text: string): number;

/**
 * Aceita AIMessage-like, usage_metadata, response_metadata.tokenUsage, ou unknown.
 * Ordem: usage_metadata.input_tokens → tokenUsage.prompt_tokens|promptTokens → 0.
 * Nunca lança; inválido/ausente → 0.
 */
function readPromptTokens(source: unknown): number;
```

**Rationale**: Spec FR-001/FR-002. Funções puras (constituição II), testáveis sem LLM. `input_tokens` é o campo canônico LangChain JS (`usage_metadata`); fallback cobre `response_metadata.tokenUsage` visto em integrações OpenAI-compatíveis / OpenRouter.

**Alternatives considered**:
- Tokenizer tiktoken / dependência extra — fora do pedido (chars÷4 explícito) e viola “sem dep nova”.
- Só `response_metadata` — menos estável que `usage_metadata` na doc atual LangChain JS.

---

## Decisão 2: `Metrics.promptTokens` acumulado nas estratégias (não só no chat)

**Decisão**:

- Estender `Metrics` com `promptTokens: number` (default 0).
- `runWithMetrics` repassa `result.metrics?.promptTokens ?? 0`.
- `createCountingModel`: além de `getLlmCalls`, expõe `getPromptTokens`; após cada `super.invoke` bem-sucedido, soma `readPromptTokens(result)` (AIMessage ou equivalente).
- ReAct usa `getPromptTokens()` no retorno.
- Plan-and-Execute: campo de estado ou acumulador paralelo às invokes (incluindo caminhos que passam pelo counting model / AIMessage); structured output que não exponha usage contribui 0 naquela chamada.
- Reflection: soma `promptTokens` das bases + `evaluated.promptTokens` do critic (espelho de `llmCalls`).
- Critic: `CriticEvaluateResult` ganha `promptTokens` (stubs = 0; LLM: tentar `readPromptTokens` no resultado bruto se acessível, senão 0 — não bloquear a feature se structured output ocultar usage).
- Aprendizado 009 (pós-resposta) **fora** do total do turno.

**Rationale**: Spec exige soma real de todas as chamadas do turno (incl. reflect). O contador já vive no model wrapper — mesmo gancho para usage. Chat só acrescenta breakdown e `historyMessages`.

**Alternatives considered**:
- Calcular `promptTokens` só no chat via estimativa — contradiz “real”.
- Callbacks LangChain globais — mais invasivo e difícil de isolar em testes.
- Exigir usage do critic structured output com `includeRaw` obrigatório — bom follow-up; v1 aceita 0 se metadata indisponível, documentado.

---

## Decisão 3: `contextBreakdown` só no `chat-service`

**Decisão**: Após montar `history` e `memoryBlock` (strings já existentes):

```ts
contextBreakdown: {
  history: estimateTokens(history),
  memory: estimateTokens(memoryBlock), // "" → 0
}
```

Em pedido em branco: `{ history: 0, memory: 0 }` e `promptTokens: 0`.

`ChatResult.metrics` = métricas da estratégia + `historyMessages` + `contextBreakdown`. HTTP serializa o objeto sem schema Zod de saída (padrão atual).

**Rationale**: Só o canal conhece as fontes separadas; a estratégia recebe um único string. Fontes mínimas da spec. Não altera composição do prompt.

**Alternatives considered**:
- Estratégia devolve breakdown — não vê memory vs history.
- Incluir system/tools da estratégia — fora do escopo (Assumption).

---

## Decisão 4: Formato JSON de `contextBreakdown`

**Decisão**: Objeto fixo com chaves `history` e `memory` (inteiros ≥ 0), sempre presentes no 200 com métricas — inclusive quando memory é 0.

**Rationale**: Contrato estável para o script e clientes; evita optional nesting. Alinhado a `historyMessages` sempre presente.

**Alternatives considered**:
- Omitir `memory` quando 0 — mais frágil para asserts/script.
- Array de `{ source, tokens }` — flexível demais para duas fontes fixas.

---

## Decisão 5: Script `conversa-longa.sh` na raiz

**Decisão**: Bash na raiz do repo. Variáveis: `BASE_URL` (default `http://127.0.0.1:3000` ou porta do projeto), `TURNS` (default ≥ 2). Fluxo: loop POST `/chat` com `conversationId` reutilizado; em cada 200 imprime uma linha com o turno e `metrics.promptTokens`; não-200 → mensagem em stderr + exit ≠ 0 (turnos já impressos permanecem). Não sobe o servidor; quickstart documenta `npm run dev`.

**Rationale**: Spec FR-008 / US3. Smoke operacional separado da suíte `npm test`.

**Alternatives considered**:
- Script Node/tsx — pedido explícito `.sh`.
- Incluir na suíte CI obrigatória com servidor — flaky; smoke manual + testes unitários das métricas bastam (SC-006).

---

## Decisão 6: Testes sem provedor

**Decisão**:

| Área | Como |
|------|------|
| `tokens.test.ts` | strings de length 0/1/4/5/8; fixtures usage_metadata / tokenUsage / lixo → números esperados |
| Estratégias / reflection | fake `run` com `promptTokens`; critic stub com `promptTokens`; assert soma |
| `/chat` HTTP | registry fake devolvendo `promptTokens` fixo; assert body; caso com memoryStore fake e texto de recall → `contextBreakdown.memory === estimateTokens(bloco)`; vazio → zeros |

**Rationale**: SC-006 / constituição V. Mesmo padrão 007–009.

**Alternatives considered**:
- Teste E2E OpenRouter na CI — rejeitado (custo/flake).

---

## Decisão 7: Compatibilidade arena/bench

**Decisão**: Se `Metrics` ganha `promptTokens` obrigatório, arena/bench que leem `llmCalls`/`latencyMs` continuam válidos (campo extra ignorável). Não obrigar impressão de breakdown/promptTokens no CLI nesta feature.

**Rationale**: Spec Assumption; escopo mínimo.

---

## NEEDS CLARIFICATION

Nenhum restante — defaults acima cobrem usage parcial, structured output sem metadata, formato do breakdown e localização do script.
