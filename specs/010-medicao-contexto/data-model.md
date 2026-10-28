# Data Model: Medição de contexto

**Phase 1 output for** `specs/010-medicao-contexto/plan.md`

Sem persistência nova. Entidades são valores de métricas e utilitários em memória por turno.

Referências: [spec.md](./spec.md), [contracts/tokens.md](./contracts/tokens.md), [contracts/chat-http.md](./contracts/chat-http.md).

---

## Estimativa de tokens

| Campo | Tipo | Regras |
|-------|------|--------|
| entrada | `string` | Qualquer texto; multibyte conta como `string.length` (não bytes UTF-8) |
| saída | `number` (inteiro ≥ 0) | `Math.floor(length / 4)`; `""` → `0` |

Função: `estimateTokens(text)`.

---

## Uso real de prompt tokens

| Campo | Tipo | Regras |
|-------|------|--------|
| fonte | `unknown` (AIMessage, `usage_metadata`, `tokenUsage`, …) | Nunca lança |
| saída | `number` (inteiro ≥ 0) | Preferir `usage_metadata.input_tokens`; senão `prompt_tokens` / `promptTokens` em `tokenUsage`; ausente/parcial → `0` |

Função: `readPromptTokens(source)`.

---

## Metrics (estratégia)

Estende o tipo já usado em `StrategyResult`:

| Campo | Tipo | Significado |
|-------|------|-------------|
| `llmCalls` | `number` ≥ 0 | Inalterado |
| `latencyMs` | `number` ≥ 0 | Inalterado |
| `promptTokens` | `number` ≥ 0 | **Novo.** Soma dos prompt tokens reais das chamadas ao modelo neste resultado de estratégia (0 se nenhuma / sem usage) |

`runWithMetrics` preenche `latencyMs` e preserva `llmCalls` + `promptTokens` vindos do work.

---

## CriticEvaluateResult (delta)

| Campo | Tipo | Significado |
|-------|------|-------------|
| `llmCalls` | `number` | Inalterado |
| `promptTokens` | `number` ≥ 0 | **Novo.** Usage da avaliação (0 em stub ou se metadata indisponível) |
| `approved` / `feedback` | — | Inalterados |

Reflection soma `promptTokens` como já soma `llmCalls`.

---

## ContextBreakdown

| Campo | Tipo | Significado |
|-------|------|-------------|
| `history` | `number` ≥ 0 | `estimateTokens(texto do histórico composto)` |
| `memory` | `number` ≥ 0 | `estimateTokens(bloco de recall)`; sem injeção ou bloco vazio → `0` |

Sempre ambas as chaves no objeto quando `metrics` inclui breakdown.

---

## ChatResult.metrics (delta)

| Campo | Tipo | Significado |
|-------|------|-------------|
| `llmCalls` | `number` | Da estratégia |
| `latencyMs` | `number` | Da estratégia |
| `historyMessages` | `number` 0–12 | Inalterado (feature 007) |
| `promptTokens` | `number` ≥ 0 | Da estratégia (soma do turno); vazio → `0` |
| `contextBreakdown` | `ContextBreakdown` | Calculado no `chat-service` a partir das strings `history` / `memoryBlock` |

Pedido em branco: `promptTokens: 0`, `historyMessages: 0`, `contextBreakdown: { history: 0, memory: 0 }`.

---

## Relacionamentos

```text
estimateTokens(history) ──┐
                          ├──► contextBreakdown ──► ChatResult.metrics
estimateTokens(memory) ───┘                              ▲
                                                         │
AIMessage usage ──► readPromptTokens ──► Metrics.promptTokens
                         (estratégia / reflection) ──────┘
```

Não há tabela SQLite, migração nem entidade persistida.

---

## Validação / invariantes

1. `contextBreakdown.*.tokens` estimados **não** precisam somar `promptTokens` (heurística ≠ tokenizer).
2. `promptTokens` do `/chat` **não** inclui o refletor de aprendizado (009).
3. Com `reflect: true`, `promptTokens` inclui bases + críticos do wrap, na medida em que o usage estiver disponível.
4. Erros 4xx/504 **não** carregam essas métricas (padrão atual).
