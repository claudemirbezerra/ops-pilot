# Quickstart: Refletor de aprendizado

**Phase 1 output for** `specs/009-refletor-aprendizado/plan.md`

Guia de validação. Sem código de implementação completo.

Referências: [data-model.md](./data-model.md), [contracts/learning-reflector.md](./contracts/learning-reflector.md), [contracts/forget-preference.md](./contracts/forget-preference.md), [contracts/chat-http.md](./contracts/chat-http.md).

---

## Pré-requisitos

- Node.js 22+
- `npm install` na raiz
- Feature 008 (MemoryStore + `userId` no `/chat`) já implementada
- A app não lê `.env` para lógica nova; OpenRouter só no extrator LLM de produção / smoke opcional

---

## 1. Validação automatizada — obrigatória

```bash
npm test
npm run typecheck
```

**Esperado**: verdes. Extrator stub; MemoryStore `:memory:` + embedder fake; `/chat` com estratégia substituta; sem OpenRouter na suíte padrão.

| # | Onde | Caso | Esperado |
|---|------|------|----------|
| 1 | `shouldRemember` | `hasLearning: false` + fact preenchido | `null` |
| 2 | `shouldRemember` | `true` + fact só espaços | `null` |
| 3 | `shouldRemember` | `true` + fact útil | string trimada |
| 4 | schedule / `runChat` | stub durável + `userId` | após microtask, recall encontra o fato |
| 5 | schedule / `runChat` | stub pontual | zero inserts |
| 6 | schedule / `runChat` | stub segredo | zero inserts |
| 7 | não-bloqueio | remember deferred | `runChat` resolve **antes** do remember completar |
| 8 | falha async | remember rejeita | answer/200 intactos |
| 9 | sem `userId` | `/chat` ou `runChat` | extractor **não** chamado |
| 10 | `forget_preference` | hit recall ≥ 0,3 | `{ forgotten: true, ... }`; fato some |
| 11 | `forget_preference` | miss | `{ forgotten: false }`; store intacto |
| 12 | `forget_preference` | sem `userId` | observação de erro; store intacto |
| 13 | isolamento | dois `userId` | aprendizado/forget não cruzam |
| 14 | regressão | arena / bench / chat sem userId | comportamento pré-009 |

`createApp` de teste: `SqliteMemoryStore(":memory:", fake)`, `SqliteConversationStore(":memory:")`, `learningExtractor` stub, registry fake.

---

## 2. Smoke manual (opcional, com LLM)

```bash
npm run dev
```

1. `POST /chat` com `userId` e mensagem de preferência durável (ex.: “prefiro que Pagamentos vá para o time azul”).
2. Confirmar 200 rápido; em seguida (segundos) um segundo `/chat` com consulta relacionada deve receber o fato no bloco de memória (ou inspecionar store via teste/REPL).
3. `POST /chat` pedindo para esquecer essa preferência (estratégia real com tools) e confirmar que o recall seguinte não a traz.
4. Mensagem com token fake (`sk-test-...`) → não deve aparecer como fato em recalls posteriores.

---

## 3. Critério de pronto

- `npm test` e `npm run typecheck` verdes
- SC-001…SC-007 cobertos pela tabela acima
- Nenhum segredo commitado; aprendizado não bloqueia a resposta do turno
