# Contract: Ferramentas do plantão (v2)

**Phase 1 output for** `specs/004-sqlite-ops-store/plan.md`

Cinco tools em `src/agents/tools.ts`. Todas seguem as **6 regras** (nome; o quê; quando usar; quando não usar; `.describe()` em todo campo; enums fechados).

Estado inicial após seed: catálogo Mercadinho (5 serviços, 6 alertas, 3 runbooks) e nenhum incidente (salvo reinício com arquivo já populado).

---

## Shared: 6 regras (checklist por tool)

1. `name` estável snake_case  
2. `description` = o que faz  
3. Inclui **quando usar**  
4. Inclui **quando não usar**  
5. Todo campo Zod com `.describe(...)`  
6. Domínio fechado → `z.enum([...])`

---

## Tool: `list_alertas`

**Quando usar**: inventário de alertas por status operacional (o que está disparando / já resolvido).  
**Quando não usar**: para incidentes formais (usar `list_incidents`) ou procedimentos (usar `consultar_runbook`).

```typescript
z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe('Filtro: "firing" (ativos), "resolved" (encerrados), "all" (todos). Default firing.'),
})
```

Sucesso: JSON (ou texto) com os alertas filtrados.  
Recusa de status inválido: validação Zod na fronteira (não chega ao store).

---

## Tool: `open_incident`

**Quando usar**: após identificar um problema que exige registro formal (ex. alerta crítico em investigação).  
**Quando não usar**: só para “olhar” alertas; não usar se o incidente já existe (aí `list_incidents` / `resolver_incident`).

```typescript
z.object({
  title: z.string().min(1).describe("Título curto do incidente"),
  service: z
    .string()
    .min(1)
    .describe("Slug do serviço afetado (ex.: payments, checkout, auth)"),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .describe("Severidade: low | medium | high | critical"),
})
```

Sucesso: incidente `open` com `id` numérico novo.  
Recusa: serviço desconhecido, título vazio → observação (store intacto).

---

## Tool: `resolver_incident`

**Quando usar**: mitigação concluída e o incidente deve fechar.  
**Quando não usar**: para criar incidente novo ou listar estado.

```typescript
z.object({
  id: z.number().int().positive().describe("ID numérico do incidente"),
  summary: z
    .string()
    .min(1)
    .optional()
    .describe("Resumo opcional da resolução (o que foi feito)"),
})
```

Sucesso em `open`: passa a `resolved` (com `resolved_at` / `summary`).  
Já `resolved`: confirma estado, sem segundo registro.  
Id ausente: observação; store intacto.

---

## Tool: `list_incidents` (NOVA)

**Quando usar**: ver incidentes abertos/resolvidos/todos durante o plantão.  
**Quando não usar**: para alertas crus (`list_alertas`) ou texto de runbook.

```typescript
z.object({
  status: z
    .enum(["open", "resolved", "all"])
    .default("open")
    .describe('Filtro: "open" (default), "resolved", ou "all".'),
})
```

Saída: lista com id, service, severity, status (e summary/`resolved_at` se houver); ou vazio.

---

## Tool: `consultar_runbook` (NOVA)

**Quando usar**: preciso dos passos operacionais de um serviço com runbook (checkout, payments, auth).  
**Quando não usar**: para inventar procedimento se não houver runbook; não substitui abrir/resolver incidente.

```typescript
z.object({
  service: z
    .string()
    .min(1)
    .describe("Slug do serviço cujo runbook será consultado"),
})
```

Sucesso: conteúdo do runbook.  
Ausência: observação descritiva via `RunbookNotFoundError` (nunca throw para fora da tool).

---

## Registration

```typescript
createOpsTools(store: OpsStore): { tools: StructuredToolInterface[] }
// 5 tools na ordem sugerida:
// list_alertas, open_incident, resolver_incident, list_incidents, consultar_runbook
```
