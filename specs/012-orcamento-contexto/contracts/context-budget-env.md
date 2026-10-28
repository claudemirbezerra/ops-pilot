# Contract: variáveis `CONTEXT_BUDGET_*`

Configuração de tetos por seção. Lida em runtime via `process.env` (ou mapa injetado em testes). **Não** carregar arquivo `.env` no código.

## Variáveis

| Nome | Seção | Default | Unidade |
|------|-------|---------|---------|
| `CONTEXT_BUDGET_SUMMARY` | resumo | `200` | estimativa `estimateTokens` |
| `CONTEXT_BUDGET_WINDOW` | janela (msgs anteriores) | `1200` | idem |
| `CONTEXT_BUDGET_MEMORY` | memória | `300` | idem |

Ausência de variável para system/message = intocáveis (sem teto).

## Parse (`resolveContextBudgets`)

Para cada variável:

1. Se `undefined` ou `""` → default.
2. `Number.parseInt(value, 10)` (ou equivalente que rejeite lixo): se não for inteiro finito ≥ 0 → default.
3. Caso contrário → esse inteiro.

Exemplos:

| Valor env | Resultado |
|-----------|-----------|
| (ausente) | default |
| `"200"` | `200` |
| `"0"` | `0` |
| `"-1"` | default |
| `"abc"` | default |
| `"12.7"` | implementação: rejeitar fracionário ou truncar via parseInt → `12`; **contrato de teste**: preferir inteiros; inválidos óbvios (`abc`, negativo) → default |

Recomendação de implementação alinhada aos testes: aceitar apenas strings que casam `/^\d+$/` → inteiro; senão default. Assim `"12.7"` → default.

## Uso

- Produção: `resolveContextBudgets(process.env)` uma vez por montagem (ou cacheado por processo — indiferente se env não muda).
- Testes: passar objeto `{ CONTEXT_BUDGET_WINDOW: "5", ... }` sem mutar `process.env` global quando possível; se mutar, restaurar no `after`/`finally`.

## Fora de escopo

- Documentar no body `/chat`
- UI / hot-reload obrigatório
- Validação Zod na borda HTTP (não é input HTTP)
