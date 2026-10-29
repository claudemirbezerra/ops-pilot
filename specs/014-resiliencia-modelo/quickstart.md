# Quickstart: Resiliência de modelo

Validação da feature 014. Contratos: [contracts/model-env.md](./contracts/model-env.md), [contracts/model-factory.md](./contracts/model-factory.md), [contracts/chat-http.md](./contracts/chat-http.md). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node 22 LTS
- `npm install`
- Sem OpenRouter para os testes unitários da fábrica / HTTP com fakes

## 1. Typecheck e suíte

```bash
npm run typecheck
npm test
```

Esperado: ambos verdes. Cobertura mínima desta feature:

- Parse de `OPENROUTER_MODEL_FALLBACK` (ausente / espaços / valor)
- Principal ok → sem reserva invocado; `modelUsed` = principal; sem evento `fallback`
- Principal falha + reserva ok → `fallback` + `modelUsed` = reserva
- Sem reserva + principal falha → `ModelUnavailableError`
- Ambos falham → `ModelUnavailableError`
- `POST /chat` → 503 `{ message }` sem `answer` quando a estratégia lança indisponibilidade
- `POST /chat` 200 preserva `metrics.modelUsed` (e `fallback` no `trace` quando aplicável)

## 2. Conferência unitária da fábrica

Após implementado:

```bash
node --import tsx --test src/agents/model.test.ts
```

Esperado: tabela do contrato [model-factory.md](./contracts/model-factory.md) coberta com fakes.

## 3. Smoke opcional com OpenRouter real

1. Definir `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (válido) e `OPENROUTER_MODEL_FALLBACK` (segundo modelo válido).
2. `npm run dev`.
3. `POST /chat` com mensagem operacional não vazia.
4. Caminho saudável: 200, `metrics.modelUsed` igual ao principal, sem `fallback` no `trace`.
5. (Opcional) Forçar falha do principal (id inválido em `OPENROUTER_MODEL` + reserva válido): 200 com `fallback` e `modelUsed` do reserva — ou 503 se o reserva também falhar.

## 4. Tabela rápida

| Cenário | Esperado |
|---------|----------|
| Sem `OPENROUTER_MODEL_FALLBACK` | Só principal; falha → 503 |
| Principal saudável + reserva setado | Reserva não chamado; sem evento `fallback` |
| Principal morto + reserva ok | Evento `fallback`; `modelUsed` = reserva; 200 |
| Ambos mortos | 503 `Modelo indisponível.` |
| Mensagem vazia | 200 aviso; sem `modelUsed` / `fallback` |

## Fora deste quickstart

- Lista de vários reservas
- Mudança de política de timeout global do `/chat` (180s)
- Arena / bench além do que já herdam `createModel`
