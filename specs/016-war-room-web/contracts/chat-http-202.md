# Contract: POST /chat — delta 202 (pendência)

Delta sobre o canal existente (003/013/014/015). Gate: [approval-gate.md](./approval-gate.md). Decisão: [approvals-http.md](./approvals-http.md).

## O que não muda

- Body Zod: `message`, `strategy?`, `reflect?`, `conversationId?`, `userId?`.
- Códigos 400 / 422 / 404 conversa / 502 / 504 / 503.
- 200 com `requestId`, `answer`, `trace`, `metrics`, `conversationId?` + header `X-Request-Id`.
- Paths: `/chat` e `/opspilot/chat` (mesma semântica).

## Novo: 202 Accepted

Quando o turno atinge gate explícito (tool marked, ainda não invocada):

**Status**: `202`

**Headers**: `X-Request-Id: <requestId>` (mesmo valor no corpo)

**Body**:

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "approvalId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "pending": {
    "tool": "resolver_incident",
    "args": { "id": "inc-1", "summary": "mitigado" },
    "description": "resolver_incident em inc-1"
  },
  "trace": [ /* TraceEvent[] parcial, inclui action pendente */ ],
  "metrics": { "llmCalls": 1, "latencyMs": 12, "promptTokens": 40 },
  "conversationId": "optional-uuid"
}
```

| Campo | Obrigatório | Notas |
|-------|-------------|-------|
| `requestId` | sim | Correlação |
| `approvalId` | sim | Path param de `POST .../approvals/:id` |
| `pending.tool` | sim | ToolName gated |
| `pending.args` | sim | objeto |
| `pending.description` | sim | string para o cartão |
| `trace` | sim | array (pode ser vazio só em casos degenerados) |
| `metrics` | sim | como no 200 |
| `conversationId` | não | se houver |
| `answer` | não | texto parcial opcional |

**MUST NOT**: tratar 202 como erro de rede na war room; **MUST NOT** executar a tool antes da decisão.

## Persistência (015)

Best-effort: gravar `requestId` + métricas + trace parcial antes do 202 (mesmo helper de persistência). Falha de save: preferir falhar o request (consistente com 015) ou documentar no implement — alinhar ao comportamento atual de `persistChatRequest`.

## Testes mínimos

- Strategy/tool path que pediria `resolver_incident` → 202 com `approvalId` + `pending.tool`.
- Path sem tool gated → 200 (nunca 202 “por precaução”).
- 202 em `/opspilot/chat` idêntico ao da raiz.
