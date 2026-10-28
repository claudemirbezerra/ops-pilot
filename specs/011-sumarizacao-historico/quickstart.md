# Quickstart: Sumarização de histórico (pruning)

Validação manual/automatizada da feature 011. Contratos: [contracts/](./contracts/). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node 22 LTS
- Dependências instaladas (`npm install`)
- Sem necessidade de OpenRouter se usar fake no `createApp` / testes

## 1. Typecheck e suíte

```bash
npm run typecheck
npm test
```

Esperado: ambos verdes. Cobertura mínima desta feature:

- Store `:memory:` — `getSummary` / `upsertSummary` / `listUnsummarizedOutsideWindow` / isolamento
- `HISTORY_LIMIT === 8` e janela em `history-prompt`
- Fake sumarizador: 0 chamadas até lote; 1 no fechamento; merge com `previousSummary`
- HTTP: prompt com bloco `Resumo da conversa`; `historyMessages` ≤ 8; `contextBreakdown.summary`; evento `summarize` só no turno de consolidação

## 2. Smoke HTTP com fake (opcional)

Subir o app com sumarizador fake injetado (via harness de teste ou script local que chama `createApp`).

1. Criar conversa: `POST /chat` sem `conversationId` → guardar id.
2. Completar turnos até haver **16** mensagens gravadas (8 turnos user+assistant), com estratégia fake que ecoa o prompt.
3. No turno que fecha o 8º egresso: resposta 200 com `trace` contendo `{ "type": "summarize", ... }`.
4. Turno seguinte: eco do prompt contém `Resumo da conversa:` e no máximo 8 linhas de Plantonista/Copiloto; **sem** novo `summarize` até o próximo lote.

## 3. Conferências rápidas

| Cenário | Esperado |
|---------|----------|
| ≤ 8 msgs no fio | Sem resumo obrigatório; sem `summarize` |
| 9–15 msgs | Sem consolidação ainda (pending &lt; 8) |
| ≥ 16 msgs (1º lote) | Um `summarize`; resumo persistido |
| +8 egressos | Segundo `summarize`; texto = merge |
| Pedido vazio / 404 | Sem mudança de resumo |

## Fora deste quickstart

- Arena / bench
- Qualidade semântica do resumo LLM em produção (só contrato de merge + alvo ~150 tokens no prompt)
