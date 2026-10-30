# Contract: GET /request/:id

Consulta do tracer persistido. Modelo: [data-model.md](../data-model.md). Store: [request-store.md](./request-store.md).

## Rota

`GET /request/:id`

Sem body. `Content-Type` da resposta: `application/json`.

## Validação de fronteira

| `:id` | Resultado |
|-------|-----------|
| Ausente / só espaços após decode | **400** com `issues` ou mensagem de validação |
| String não vazia | Segue para o store |

Sem auth adicional (mesmo modelo das demais rotas).

## 200 — encontrado

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": 1730000000000,
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 12,
    "promptTokens": 40,
    "historyMessages": 1,
    "contextBreakdown": { "history": 0, "memory": 0, "summary": 0 }
  },
  "trace": [
    { "type": "thought", "content": "…", "node": "react" },
    { "type": "answer", "content": "…", "node": "response" }
  ]
}
```

| Campo | Regra |
|-------|-------|
| `requestId` | Igual ao `:id` e à PK persistida |
| `createdAt` | Epoch ms gravado no save |
| `metrics` | Objeto parseado de `metrics_json` (coerente com o 200 do `/chat` daquele turno) |
| `trace` | Array na ordem `seq` crescente; cada item é o `TraceEvent` original |

## 404 — não encontrado

```json
{ "message": "Request não encontrado." }
```

Status **404**. Origem: `RequestNotFoundError` (ou `getById === null` traduzido na borda).

## Ordem de tratamento

1. Validar `:id` → 400 se inválido.
2. `getById` → 404 se null.
3. 200 com registro + trace ordenado.

## Injeção para teste

- Gravar via `save` ou via `POST /chat` no mesmo `requestStore` injetado.
- Assert ordem de `trace` independente da ordem física se `seq` estiver correto.
- Id desconhecido → 404.
