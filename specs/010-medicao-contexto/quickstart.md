# Quickstart: Medição de contexto

**Phase 1 output for** `specs/010-medicao-contexto/plan.md`

Guia de validação. Sem código de implementação completo.

Referências: [data-model.md](./data-model.md), [contracts/tokens.md](./contracts/tokens.md), [contracts/chat-http.md](./contracts/chat-http.md), [contracts/conversa-longa.md](./contracts/conversa-longa.md).

---

## Pré-requisitos

- Node.js 22+
- `npm install` na raiz
- Features 007–009 (conversa, memória, refletor) já no código base
- A app não lê `.env` para a lógica nova; OpenRouter só para smoke opcional / script com modelo real

---

## 1. Validação automatizada — obrigatória

```bash
npm test
npm run typecheck
```

**Esperado**: verdes. Sem OpenRouter na suíte padrão.

| # | Onde | Caso | Esperado |
|---|------|------|----------|
| 1 | `estimateTokens` | `""`, `"abcd"`, `"abcde"` | `0`, `1`, `1` |
| 2 | `readPromptTokens` | `usage_metadata.input_tokens` | valor ecoado |
| 3 | `readPromptTokens` | ausente / lixo | `0` |
| 4 | `Metrics` / `runWithMetrics` | work devolve `promptTokens: 7` | resultado com `7` |
| 5 | counting model / estratégia | fixture AIMessage com usage | `getPromptTokens` / metrics somam |
| 6 | reflection | base 3 + critic 2 | `promptTokens === 5` |
| 7 | `/chat` 200 | fake `promptTokens: 99` | body.metrics.promptTokens === 99 |
| 8 | `/chat` + memória | bloco de recall conhecido | `contextBreakdown.memory === estimateTokens(bloco)` |
| 9 | `/chat` sem `userId` | — | `contextBreakdown.memory === 0` |
| 10 | `/chat` mensagem em branco | — | `promptTokens === 0`, breakdown zeros |
| 11 | regressão | `llmCalls`, `latencyMs`, `historyMessages` | ainda presentes |

`createApp` de teste: stores `:memory:`, registry fake com `promptTokens` controlado.

---

## 2. Smoke manual — script (opcional, servidor no ar)

```bash
npm run dev
# outro terminal:
TURNS=3 ./conversa-longa.sh
```

**Esperado** (ver [conversa-longa.md](./contracts/conversa-longa.md)):

- N linhas com `promptTokens` por turno
- Mesmo `conversationId` reutilizado após o primeiro 200
- Servidor parado → exit ≠ 0 com erro visível

Com OpenRouter configurado no processo do `dev`, os valores tendem a ser > 0; com substituto/local sem modelo, podem ser 0 — o script ainda deve imprimir o campo.

---

## 3. Smoke HTTP pontual (opcional)

```bash
curl -s -X POST "$BASE_URL/chat" -H "Content-Type: application/json" \
  -d '{"message":"listar alertas"}' | jq .metrics
```

**Esperado**: objeto com `promptTokens` (número) e `contextBreakdown.history` / `.memory`.

---

## Critério de pronto para `/speckit-tasks`

- Contratos e data-model revisados
- Suíte acima mapeável 1:1 para tarefas de teste
- Script e campos HTTP alinhados à spec SC-001–SC-006
