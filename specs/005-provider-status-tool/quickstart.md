# Quickstart: Status de Provedores Externos

**Phase 1 output for** `specs/005-provider-status-tool/plan.md`

Guia de validação end-to-end. Sem código de implementação completo.

Referências: [data-model.md](./data-model.md), [contracts/check-provider-status.md](./contracts/check-provider-status.md).

---

## Pré-requisitos

- Node.js 22+
- `npm install` na raiz
- Para smoke com agente + LLM: credenciais de modelo já usadas pelo projeto (código não lê `.env`)

---

## 1. Validação automatizada (sem rede) — obrigatória

```bash
npm test
npm run typecheck
```

**Esperado**: verdes, incluindo casos da nova tool com **fetch falso**:

| # | Caso | Esperado |
|---|------|----------|
| 1 | Sucesso default (`provider` omitido / `github`) | uma linha `indicator — description` |
| 2 | Sucesso `cloudflare` | idem; URL mapeada para Cloudflare no fake (assert de URL se o fake inspecionar args) |
| 3 | Timeout / `AbortError` (com retry esgotado) | string de erro legível; `invoke` resolve (não rejeita) |
| 4 | Body inválido (`{}` / sem `status`) | string de erro legível; sem throw |
| 5 | (opcional) 1ª tentativa 503 + 2ª 200 | linha de sucesso (SC-005) |

Nenhum teste desta feature deve chamar `githubstatus.com` / `cloudflarestatus.com` de verdade.

---

## 2. Smoke manual com rede (opcional)

Só para conferência humana; não substitui a suíte.

```bash
npm run arena
# ou npm run dev + POST /chat pedindo status do GitHub / Cloudflare
```

Pedido exemplo: “O GitHub está fora do ar ou é problema nosso? Consulte o status do provedor.”

**Esperado**: rastro com ação `check_provider_status` e observação em uma linha (ou erro legível se a status page estiver inacessível).

---

## 3. Regressão do plantão

```bash
npm test
```

**Esperado**: tools existentes (`list_alertas`, `open_incident`, `resolver_incident`, `list_incidents`, `consultar_runbook`) continuam verdes em `:memory:`; a sexta tool não quebra composição.

---

## Critérios de pronto (ligação à spec)

| SC | Como validar neste quickstart |
|----|-------------------------------|
| SC-001 | Caso 1 da tabela §1 |
| SC-002 | Casos 3–4 (e retry esgotado) |
| SC-003 | Toda a §1 sem rede |
| SC-004 | Schema/descrição na tool + caso 1–2 |
| SC-005 | Caso 5 (recomendado) |
