# Data Model: Status de Provedores Externos

**Phase 1 output for** `specs/005-provider-status-tool/plan.md`

Sem persistência. Entidades são valores em memória / resultado da tool.

---

## ProviderId

Identificador do provedor suportado.

| Campo | Tipo | Regras |
|-------|------|--------|
| valor | `"github"` \| `"cloudflare"` | enum fechado; default da tool = `"github"` |

---

## ProviderStatusUrl

Mapeamento estático (não persistido):

| ProviderId | URL |
|------------|-----|
| `github` | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | `https://www.cloudflarestatus.com/api/v2/status.json` |

Sem autenticação. Somente leitura.

---

## StatusPagePayload (fronteira HTTP)

Corpo JSON mínimo aceito da Statuspage `/v2/status.json`:

| Campo | Tipo | Validação |
|-------|------|-----------|
| `status.indicator` | string | obrigatório, `min(1)` |
| `status.description` | string | obrigatório, `min(1)` |

Demais campos do JSON oficial são ignorados (não entram no resultado da tool).

**Falha de validação** → não há entidade `ProviderStatus`; a tool emite `ProviderStatusResult` de erro.

---

## ProviderStatus

Retrato agregado após parse bem-sucedido.

| Campo | Tipo | Origem |
|-------|------|--------|
| `provider` | `ProviderId` | argumento da tool |
| `indicator` | string | `status.indicator` |
| `description` | string | `status.description` |

Não há máquina de estados própria: o indicador é opaco (texto do provedor).

---

## ProviderStatusResult

Resultado observável da tool (sempre `string`):

| Variante | Forma | Quando |
|----------|--------|--------|
| Sucesso | uma linha: `{indicator} — {description}` | parse OK |
| Erro | string legível em português (ou mista com detalhe técnico curto) | timeout, rede, 4xx/5xx esgotados, JSON/Zod inválido |

**Invariante**: a execução da tool / helper **não propaga exceção**; ambas as variantes são o valor de retorno (observação).

---

## Relacionamentos

```text
ProviderId ──maps──► ProviderStatusUrl
                │
                ▼ (fetch + Zod)
         StatusPagePayload
                │
                ▼ (format)
         ProviderStatus ──► ProviderStatusResult (sucesso)
         
falha em qualquer etapa ──► ProviderStatusResult (erro)
```

Não se relaciona com `OpsStore`, alertas, incidentes ou runbooks.
