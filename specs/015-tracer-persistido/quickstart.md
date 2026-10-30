# Quickstart: Tracer persistido e logs JSON

Validação da feature 015. Contratos: [contracts/chat-http.md](./contracts/chat-http.md), [contracts/get-request-http.md](./contracts/get-request-http.md), [contracts/request-store.md](./contracts/request-store.md), [contracts/logger.md](./contracts/logger.md). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node 22 LTS
- `npm install`
- Sem OpenRouter para os testes com registry/store fakes

## 1. Typecheck e suíte

```bash
npm run typecheck
npm test
```

Esperado: ambos verdes. Cobertura mínima desta feature:

- `SqliteRequestStore` `:memory:` — save + getById; ordem `seq`; trace vazio
- Logger — N linhas JSON para N eventos; sem chaves de payload; writer injetável
- `POST /chat` — `requestId` no corpo === `X-Request-Id`; dois chats → ids distintos
- Após `/chat` 200 — `GET /request/:id` 200 com mesmas métricas/eventos ordenados
- `GET /request/desconhecido` — 404
- Pedido em branco — grava request; GET recupera

## 2. Conferência unitária do store e logger

Após implementado:

```bash
node --import tsx --test src/store/sqlite-request-store.test.ts src/obs/logger.test.ts
```

Esperado: invariantes de [request-store.md](./contracts/request-store.md) e [logger.md](./contracts/logger.md).

## 3. Smoke HTTP local (opcional)

1. `npm run dev` (banco default ou `OPSPILOT_DB` apontando para um arquivo de teste).
2. `POST /chat` com mensagem operacional (ou registry real).
3. Anotar `requestId` do JSON e do header `X-Request-Id` — devem coincidir.
4. `GET /request/<requestId>` — 200 com `trace` alinhado ao do POST.
5. `GET /request/00000000-0000-0000-0000-000000000000` — 404.

## 4. Tabela rápida

| Cenário | Esperado |
|---------|----------|
| `/chat` 200 | `requestId` corpo = header; linha(s) JSON de metadados; linha em `requests` |
| `/chat` blank 200 | Request persistido; GET ok; sem linhas de trace inventadas |
| Dois `/chat` | Dois ids; GET de A não lista eventos de B |
| GET id ok | `trace` ordenado por ocorrência |
| GET id ausente | 404 `{ message }` |
| Log | Parse OK; sem `content`/`args`/`payload` |

## Fora deste quickstart

- Persistência de turnos 4xx/5xx
- Auth em `GET /request/:id`
- Arena / bench gravando tracer
- Retenção/TTL de `requests`
