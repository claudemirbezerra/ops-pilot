# Quickstart: Memória semântica

**Phase 1 output for** `specs/008-memoria-semantica/plan.md`

Guia de validação. Sem código de implementação completo.

Referências: [data-model.md](./data-model.md), [contracts/memory-store.md](./contracts/memory-store.md), [contracts/embeddings.md](./contracts/embeddings.md), [contracts/chat-http.md](./contracts/chat-http.md).

---

## Pré-requisitos

- Node.js 22+
- `npm install` na raiz (inclui `@huggingface/transformers` após a implementação)
- A app não lê `.env` para lógica de negócio. `OPSPILOT_DB` só vale se o processo já recebeu a variável
- Primeiro embed real pode baixar o modelo `Xenova/all-MiniLM-L6-v2` (cache local)

---

## 1. Validação automatizada — obrigatória

```bash
npm test
npm run typecheck
```

**Esperado**: verdes. Maioria dos testes em `:memory:` com embedder fake; um ensaio semântico com modelo real; `/chat` com estratégia substituta sem LLM externo.

| # | Onde | Caso | Esperado |
|---|------|------|----------|
| 1 | similarity pura | `dot`, filtro 0,3, top-3, empate | ordem estável |
| 2 | store | *remember* fato novo | registro com `userId`, recuperável |
| 3 | store | *remember* quase igual (dot > 0,92) | sem segunda linha |
| 4 | store | *remember* com dot ≤ 0,92 | segunda linha |
| 5 | store | dois `userId` | isolamento no recall/dedup/forget |
| 6 | store | *recall* top-3 / min 0,3 | só elegíveis, ≤ 3 |
| 7 | store | *forget* | some; id alheio → `MemoryNotFoundError` |
| 8 | store | fato/user em branco | `InvalidMemoryInputError` |
| 9 | embeddings | ensaio SC-003 | fato “o datacenter financeiro tem tinta azul” vs “qual cor do ambiente de payments?” → no top, score ≥ 0,3, **sem palavra em comum** (par ajustado ao limiar do MiniLM) |
| 10 | `POST /chat` | com `userId` e fato prévio | substituto recebe bloco `Memória do plantonista:` + histórico |
| 11 | `POST /chat` | sem `userId` | prompt só histórico; regressão 007 |
| 12 | `POST /chat` | `userId` vazio / número | 400 |
| 13 | `POST /chat` | mensagem só espaços + `userId` | 200 vazio, sem recall |
| 14 | regressão | arena / bench | sem exigir MemoryStore no fluxo |

`createApp` de teste injeta `SqliteMemoryStore(":memory:", fakeEmbedder)` e `SqliteConversationStore(":memory:")`.

---

## 2. Smoke manual (opcional, com modelo real)

```bash
npm run dev
```

1. Em outro processo/teste, *remember* para `userId=demo` o fato do ensaio SC-003 (via script de teste ou REPL — não há endpoint HTTP nesta feature).
2. `POST /chat` com `{ "message": "qual cor do ambiente de payments?", "userId": "demo" }` e registry substituto que ecoa o prompt **ou** observar no trace/answer que o fato foi usado.
3. Reiniciar no mesmo `OPSPILOT_DB` e repetir o recall — fato ainda presente.

---

## 3. Critério de pronto

- `npm test` e `npm run typecheck` verdes
- Checklist da spec (SC-001…SC-008) coberto pelos casos da tabela acima
- Nenhum segredo commitado; `.env` não lido pela lógica nova
