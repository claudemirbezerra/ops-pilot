# Quickstart: Orçamento de contexto por seção

Validação da feature 012. Contratos: [contracts/context-builder.md](./contracts/context-builder.md), [contracts/context-budget-env.md](./contracts/context-budget-env.md). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node 22 LTS
- `npm install`
- Sem OpenRouter para os testes unitários do builder

## 1. Typecheck e suíte

```bash
npm run typecheck
npm test
```

Esperado: ambos verdes. Cobertura mínima desta feature:

- `resolveContextBudgets` — defaults 200/1200/300; inválidos → default; overrides válidos
- `buildContext` com tetos baixos:
  - system e message idênticos à entrada
  - janela remove mais antigas primeiro
  - memória remove menor score primeiro (empate estável)
  - resumo final com `estimateTokens ≤` teto
- `runChat` / estratégias: prompt composto passa pelo builder (caminho único)

## 2. Conferência manual da ordem de corte (unitário)

Rodar só o arquivo do builder (após implementado):

```bash
node --import tsx --test src/context/context-builder.test.ts
```

Esperado: casos com `budgets` artificiais (ex. window/memory/summary = 5–20) passam; falha se a ordem de remoção inverter.

## 3. Smoke opcional via env + `/chat`

1. Exportar tetos baixos, por exemplo:
   - `CONTEXT_BUDGET_SUMMARY=10`
   - `CONTEXT_BUDGET_WINDOW=20`
   - `CONTEXT_BUDGET_MEMORY=10`
2. Subir o app (`npm run dev`) com estratégia eco / fake que devolve o prompt.
3. Turno com histórico longo + recall com vários scores + resumo grande.
4. Conferir no eco: mensagem atual e (se injetado) system intactos; blocos cortáveis enxutos; `metrics.contextBreakdown` de summary/memory/history coerente com o texto orçado (≤ tetos na estimativa das seções orçadas).

## 4. Tabela rápida

| Cenário | Esperado |
|---------|----------|
| Env ausente | Defaults 200 / 1200 / 300 |
| `CONTEXT_BUDGET_WINDOW=0` | Sem linhas de janela anterior; mensagem atual ainda no prompt |
| Scores 0.9 &gt; 0.2, memória apertada | Permanece o de 0.9 |
| Três msgs na window, teto mínimo | Permanece a mais recente |

## Fora deste quickstart

- Orçamento global
- Alterar política de 8 mensagens / sumarização
- Arena / bench
