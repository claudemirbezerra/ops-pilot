# Data Model: War room web

**Feature**: `016-war-room-web`  
Fonte: [spec.md](./spec.md). Contratos: [contracts/](./contracts/).

---

## PendingApproval

Pendência humana criada quando uma tool gated seria invocada.

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `id` | `string` | PK; UUID (`randomUUID()`); NOT NULL |
| `createdAt` | `number` | Epoch ms; NOT NULL |
| `status` | `"pending" \| "approved" \| "denied"` | NOT NULL; inicia `pending` |
| `tool` | `ToolName` | NOT NULL; ∈ `TOOLS_REQUIRING_HUMAN_APPROVAL` |
| `args` | `Record<string, unknown>` | NOT NULL; args da tool call |
| `description` | `string` | Texto curto para o cartão (tool + resumo dos args) |
| `requestId` | `string` | Correlação com o turno HTTP que gerou o 202 |
| `conversationId` | `string \| undefined` | Se o chat já tinha conversa |
| `trace` | `TraceEvent[]` | Trace parcial até o gate (inclui `action` pendente) |
| `metrics` | `Metrics` | Métricas acumuladas até o gate |
| `resolvedAt` | `number \| undefined` | Epoch ms quando sai de `pending` |

**Ciclo de vida**:
1. `pending` — criado no pause-before-invoke; HTTP 202.
2. `approved` — tool executada; resposta 200 do endpoint de approvals.
3. `denied` — tool **não** executada; observation/answer de negativa; 200.
4. Segunda resolução → `ApprovalAlreadyResolvedError`.

**Persistência MVP**: apenas memória do processo (`InMemoryApprovalStore`). Reinício do Node descarta pendências.

---

## ChatOutcome (resultado interno)

Discriminador retornado por `runChat` / strategy ao HTTP — **não** é tabela.

| `kind` | Campos principais | HTTP |
|--------|-------------------|------|
| `completed` | `answer`, `trace`, `metrics`, `conversationId?` | 200 |
| `pending_approval` | `approvalId`, `pending` (`tool`, `args`, `description`), `trace`, `metrics`, `conversationId?`, `answer?` | 202 |

---

## ApprovalDecision

Body do endpoint de decisão (validado com Zod na borda).

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `decision` | `"approve" \| "deny"` | obrigatório; enum fechado |

---

## ApiClientConfig (cliente war room)

Preferência local do browser — **não** no servidor.

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `apiBaseUrl` | `string` | URL absoluta `http:`/`https:`; sem trailing slash na forma canônica |
| storage key | `string` | ex. `opspilot.warRoom.apiBaseUrl` |
| default | `string` | `http://127.0.0.1:3000` |

---

## TraceEvent (consumo UI)

Reusa o union existente em `src/agents/strategy.ts` (`thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`, `route`, `fallback`). A war room tipa o JSON do corpo; não redefine o domínio.

---

## Erros de domínio (novos)

| Erro | HTTP | Quando |
|------|------|--------|
| `ApprovalNotFoundError` | 404 | `id` desconhecido |
| `ApprovalAlreadyResolvedError` | 409 | approve/deny em pendência já resolvida |

---

## Relacionamentos

```text
POST /chat (turno)
    │
    ├─ completed ──────────────────────────────► 200 + TraceEvent[]
    │
    └─ pending_approval ─► PendingApproval ─► 202
                                │
                    POST /approvals/:id { decision }
                                │
                    ├─ approve → invoke tool → 200 completed-like
                    └─ deny    → sem invoke  → 200 com decision deny
```

`RequestStore` (015) permanece independente; pode gravar `requestId` + trace parcial no 202, mas a UI do MVP lê o `trace` do corpo.
