# Contract: POST /approvals/:id

Paths: `/approvals/:id` e `/opspilot/approvals/:id` (mesma semântica).

## Request

**Method**: `POST`  
**Params**: `id` — UUID da pendência (`approvalId` do 202); trim; vazio → 400 `{ issues }`.

**Body** (Zod):

```ts
z.object({
  decision: z.enum(["approve", "deny"]),
})
```

Inválido → 400 `{ issues }` (Zod issues).

## Responses

### 200 — resolvido

```json
{
  "requestId": "…",
  "approvalId": "…",
  "decision": "approve",
  "answer": "…",
  "trace": [ /* … inclui observation da tool ou da negativa */ ],
  "metrics": { "llmCalls": 1, "latencyMs": 20, "promptTokens": 40 },
  "conversationId": "optional"
}
```

| `decision` | Comportamento |
|------------|---------------|
| `approve` | Invoca a tool pendente com `args` salvos; acrescenta `observation` (+ `answer` coerente) |
| `deny` | **Não** invoca a tool; `answer`/observation explicam a negativa |

Header `X-Request-Id` = `requestId` da pendência (quando conhecido).

### 404

`ApprovalNotFoundError` → `{ message }`.

### 409

`ApprovalAlreadyResolvedError` → `{ message }` (segunda decisão no mesmo id).

### 400

`:id` vazio ou body inválido → `{ issues }`.

## Idempotência

Primeira decisão vence; segunda → 409. Não há “reabrir” no MVP.

## Testes mínimos

- Após 202, `POST .../approvals/:id` approve → 200 + tool side-effect observável (store fake).
- Deny → 200 + sem side-effect da tool.
- Id inexistente → 404; segunda resolução → 409.
- Espelho `/opspilot/approvals/:id` igual à raiz.
