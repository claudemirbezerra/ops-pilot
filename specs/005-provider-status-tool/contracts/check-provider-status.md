# Contract: `check_provider_status`

**Phase 1 output for** `specs/005-provider-status-tool/plan.md`

Uma tool nova no conjunto do plantão (`createOpsTools`). Segue as **6 regras** (nome; o quê; quando usar; quando não usar; `.describe()`; enum).

Não muta `OpsStore`. Não exige API key.

---

## Shared: 6 regras (checklist)

1. `name` = `check_provider_status`
2. `description` = o que faz (consulta status público)
3. Inclui **quando usar** (suspeita externa / “é o nosso ou do provedor?” / dependência fora do ar)
4. Inclui **quando não usar** (não substitui `list_alertas` / `list_incidents` / `consultar_runbook`)
5. Campo `provider` com `.describe(...)`
6. `z.enum(["github", "cloudflare"])` + default `github`

---

## Tool: `check_provider_status`

**Quando usar**: suspeita de problema no provedor externo; triagem “é o nosso ou do provedor?”; dependência (GitHub / Cloudflare) aparentemente fora do ar.  
**Quando não usar**: inventário de alertas ou incidentes internos; procedimento operacional (runbook).

### Schema de entrada

```typescript
z.object({
  provider: z
    .enum(["github", "cloudflare"])
    .default("github")
    .describe(
      'Provedor cuja status page pública será consultada: "github" (default) ou "cloudflare".',
    ),
})
```

`provider` inválido: rejeitado na fronteira Zod (não chega ao fetch).

### Comportamento de consulta

| Provider | URL |
|----------|-----|
| `github` | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | `https://www.cloudflarestatus.com/api/v2/status.json` |

| Regra | Contrato |
|-------|----------|
| Timeout | 5s por tentativa via `AbortSignal.timeout(5000)` |
| Retry | Exatamente **uma** nova tentativa se: erro de rede, timeout/`AbortError`, ou HTTP ≥ 500 |
| Sem retry | HTTP 4xx; JSON inválido; falha Zod do body |
| Body OK | Zod: `{ status: { indicator: string.min(1), description: string.min(1) } }` |
| Sucesso | string **uma linha**: `{indicator} — {description}` |
| Falha final | string de erro legível; **nunca** throw para fora da tool/helper |
| Fetch | injetável (`deps.fetchImpl` em `createOpsTools`); default `globalThis.fetch` |

### Sucesso (exemplo)

```text
none — All Systems Operational
```

### Falha (exemplos de forma — texto exato livre desde que legível)

```text
Não foi possível consultar o status de github: timeout after 5s
Não foi possível consultar o status de cloudflare: HTTP 503
Não foi possível consultar o status de github: resposta inválida
```

### Integração

- Incluída no array `tools` de `createOpsTools`.
- `ToolName` inclui `"check_provider_status"`.
- Prompt Plan-and-Execute lista a tool.
- `trace.ts` reconhece o nome (sem fallback para `list_alertas`).

---

## Fora do contrato

- Consultar outros provedores além de `github` / `cloudflare`.
- Autenticação / API keys.
- Persistência do status.
- Retry infinito ou backoff longo.
- Devolver o JSON completo da Statuspage como observação.
