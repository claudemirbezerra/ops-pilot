# Contract: utilitário de tokens (`src/context/tokens.ts`)

API interna pura. Consumidores: estratégias/`model`, `chat-service`, testes. Sem I/O.

## `estimateTokens(text: string): number`

| Entrada | Saída |
|---------|--------|
| `""` | `0` |
| length `1`–`3` | `0` |
| length `4` | `1` |
| length `5` | `1` |
| length `8` | `2` |

Regra: `Math.floor(text.length / 4)`.

Não trim antes de contar (espaços contam).

## `readPromptTokens(source: unknown): number`

Prioridade de leitura:

1. Objeto com `usage_metadata.input_tokens` (number finito ≥ 0) — inclusive se `source` for AIMessage-like com essa propriedade.
2. `response_metadata.tokenUsage.prompt_tokens` ou `.promptTokens` (number finito ≥ 0).
3. Objeto “usage” direto: `input_tokens` ou `prompt_tokens` / `promptTokens`.
4. Caso contrário → `0`.

Nunca lança. `NaN`, negativo ou não-número → tratado como ausente → `0`.

## Exemplos

```ts
estimateTokens("abcd") === 1;
readPromptTokens({ usage_metadata: { input_tokens: 42 } }) === 42;
readPromptTokens({ response_metadata: { tokenUsage: { prompt_tokens: 10 } } }) === 10;
readPromptTokens(undefined) === 0;
```

## Fora de escopo

- Tokenizer do provedor
- Completion / output tokens (não expostos nesta feature)
- Persistência do histórico de usage
