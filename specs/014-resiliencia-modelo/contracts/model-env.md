# Contract: variáveis de modelo (fallback)

Configuração do modelo reserva. Lida em runtime via `process.env` (ou mapa injetado em testes). **Não** carregar arquivo `.env` no código.

## Variáveis

| Nome | Papel | Obrigatório |
|------|-------|-------------|
| `OPENROUTER_API_KEY` | Credencial OpenRouter | sim (já existente) |
| `OPENROUTER_MODEL` | Modelo principal | sim (já existente) |
| `OPENROUTER_MODEL_FALLBACK` | Modelo reserva (único) | não |

## Parse do reserva (`resolveFallbackModel` ou equivalente)

Entrada: `env.OPENROUTER_MODEL_FALLBACK`.

1. `undefined` → sem reserva.
2. Após `trim()`, se `""` → sem reserva.
3. Caso contrário → essa string (mesmo que igual a `OPENROUTER_MODEL`).

Não validar se o id existe no catálogo OpenRouter (falha em runtime → caminho de resiliência / 503).

## Exemplos

| Valor env | Resultado |
|-----------|-----------|
| (ausente) | sem reserva |
| `""` | sem reserva |
| `"   "` | sem reserva |
| `"openai/gpt-4o-mini"` | reserva = `openai/gpt-4o-mini` |

## Uso

- Produção: lido na fábrica junto com chave e modelo principal.
- Testes: passar objeto env sem mutar `process.env` global quando possível.

## Fora de escopo

- Lista CSV de vários reservas
- UI / hot-reload
- Documentar no body `/chat`
