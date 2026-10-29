# Contract: fábrica de modelo resiliência

Superfície de `src/agents/model.ts` (e helpers internos). Modelo de dados: [data-model.md](../data-model.md). Env: [model-env.md](./model-env.md).

## Composição

Seja `P` o `ChatOpenAI` do principal e `R` o do reserva (se houver), ambos com `maxRetries: 0`, mesmo `apiKey`, `timeout: MODEL_REQUEST_TIMEOUT_MS`, `baseURL` OpenRouter.

1. `P' = P.withRetry({ stopAfterAttempt: MODEL_MAX_RETRIES + 1 })`
2. Sem reserva: cliente = `P'` (ou wrapper de observação sobre `P'`).
3. Com reserva: cliente = `P'.withFallbacks([R])` (ou `withFallbacks({ fallbacks: [R] })`), com wrappers de observação em `P`/`R` (ou equivalentes) para gravar sessão.

`MODEL_MAX_RETRIES` permanece `2` → **3** tentativas no principal antes do reserva.

## API pública (comportamento)

### `createModel(env?)`

- Lê config; falta chave/modelo principal → `MissingModelConfigError`.
- Devolve runnable invocável (chat) com resiliência + acesso à sessão (`getModelUsed` / `didFallback` — forma exata na implementação: objeto envelope ou getters no módulo, desde que testável).
- Invoke que esgota todos os elos → lança `ModelUnavailableError`.

### `createCountingModel(maxIterations, env?)`

- Mesma resiliência e sessão.
- Mantém contagem de invokes reais e prompt tokens como hoje.
- Limite de iterações (mensagem de teto) **não** é tratado como falha de modelo / não dispara fallback por si só.

### Structured output (roteador / críticos)

Helper (nome livre no implement) que aplica `withStructuredOutput` **por** chat base e só então `withRetry` / `withFallbacks`, para o composto continuar tipado como runnable estruturado.

## Observabilidade

| Situação | Sessão | Rastro | Métricas |
|----------|--------|--------|----------|
| Sucesso só no principal | `modelUsed = primary`, `didFallback = false` | sem evento `fallback` | `modelUsed` = primary |
| Sucesso via reserva | `modelUsed = fallback`, `didFallback = true` | evento `fallback` `{ from: primary, to: fallback }` | `modelUsed` = fallback |
| Esgota tudo | lança `ModelUnavailableError` | n/a no 200 | n/a no 200 |

Evento mínimo:

```json
{
  "type": "fallback",
  "from": "openai/gpt-4o",
  "to": "openai/gpt-4o-mini"
}
```

`node` opcional conforme a etapa chamadora.

## Testes de contrato (fábrica)

| # | Setup | Esperado |
|---|--------|----------|
| 1 | Principal ok, reserva configurado | Uma chamada; reserva não invocado; sem `fallback`; `modelUsed` = primary |
| 2 | Principal falha sempre, reserva ok | Após retries do principal, reserva 1× sucesso; `didFallback`; evento `from`/`to` corretos |
| 3 | Sem `OPENROUTER_MODEL_FALLBACK`, principal falha | `ModelUnavailableError` após retries; sem segundo modelo |
| 4 | Principal e reserva falham | `ModelUnavailableError` |
| 5 | Fallback env só espaços | Igual ao caso sem reserva |

Fakes: runnables que rejeitam/resolvem; **sem** rede OpenRouter.

## Fora de escopo

- Múltiplos reservas encadeados além do único env
- Alterar `MODEL_REQUEST_TIMEOUT_MS` por elo
- Circuit breaker / half-open
