# Research: Status de Provedores Externos

**Phase 0 output for** `specs/005-provider-status-tool/plan.md`

---

## Contexto

O plantão já tem 5 tools sobre `OpsStore` (alertas, incidentes, runbook). Falta uma tool de observação externa para responder “é nosso ou do provedor?” via Statuspage.io pública (GitHub / Cloudflare). A spec fixa URLs, timeout 5s, 1 retry, Zod no payload, retorno compacto e fetch injetável. Esta fase fecha forma de injeção, política de retry (timeout/4xx), formato da linha e onde encaixar no grafo (`ToolName` / prompt / trace).

---

## Decisão 1: Fetch injetável via deps em `createOpsTools`

**Decisão**: Estender a fábrica:

```typescript
type CreateOpsToolsDeps = {
  fetchImpl?: typeof globalThis.fetch;
};

export function createOpsTools(
  store: OpsStore = createDefaultOpsStore(),
  deps: CreateOpsToolsDeps = {},
)
```

- Produção: `deps.fetchImpl` omitido → `globalThis.fetch`.
- Testes: passam `fetchImpl` falso que ignora URL real e devolve `Response` / rejeita com `AbortError` / etc.
- A tool `check_provider_status` (e o helper) recebe `fetchImpl` fechado no closure.

**Rationale**: FR-011; padrão já usado com `store` injetável; evita monkey-patch global e não quebra assinatura posicional existente (`createOpsTools(store)`).

**Alternatives considered**:
- Monkey-patch `globalThis.fetch` nos testes — frágil e vaza entre testes.
- Factory separada só da tool sem passar por `createOpsTools` — duplica composição e esquece de registrar no array `tools`.
- Segundo argumento posicional `fetch` sem objeto deps — menos extensível se aparecer outra dep.

---

## Decisão 2: Helper `fetchProviderStatus` + funções puras

**Decisão**: Extrair (em `tools.ts` ou `src/agents/provider-status.ts`):

| Peça | Pure? | Papel |
|------|-------|--------|
| `PROVIDER_STATUS_URLS` | sim | mapa `github` / `cloudflare` → URL |
| `statusPageBodySchema` | sim | Zod `{ status: { indicator: string, description: string } }` (strings não vazias) |
| `formatProviderStatusLine` | sim | `"${indicator} — ${description}"` |
| `fetchProviderStatus(provider, fetchImpl)` | não | timeout, retry, parse; **sempre** retorna `string` (sucesso ou erro); **nunca** throws |

A tool LangChain só chama o helper e devolve a string (try/catch residual → `asObservation` por defesa em profundidade).

**Rationale**: Constitution II (I/O isolado; parse/format puros); FR-008–FR-010; testes unitários do helper sem `tool()`.

**Alternatives considered**:
- Toda a lógica inline no callback `tool()` — difícil de testar timeout/retry sem LangChain.
- Lançar erros de domínio e confiar só em `asObservation` — ok para store tools, mas a spec exige que a própria consulta HTTP já devolva string (erro é resultado).

---

## Decisão 3: Timeout + política de retry

**Decisão**:

- Cada tentativa: `fetch(url, { signal: AbortSignal.timeout(5_000) })`.
- **Retry exatamente 1 vez** quando a falha for: rejeição de rede, `AbortError`/timeout, ou HTTP status ≥ 500.
- **Sem retry** em: HTTP 4xx, JSON inválido, falha Zod (já houve resposta utilizável para decidir).
- Após esgotar tentativas (ou falha não-retriável): string legível, ex.:  
  `Não foi possível consultar o status de github: timeout after 5s` / `HTTP 503` / `resposta inválida`.

**Rationale**: Alinha FR-006/FR-007 e Assumptions da spec; timeout tratado como falha transitória (mesmo espírito que rede); 4xx não beneficiam de retry cego.

**Alternatives considered**:
- Timeout sem retry — mais rígido que “política de retry aplicável” da US2.
- Retry também em 4xx — desperdiça tentativa; 4xx costuma ser estável.
- Retry em Zod fail — payload ruim não melhora com segunda chamada imediata (e gastaria outro timeout).

---

## Decisão 4: Formato compacto e schema Zod do body

**Decisão**:

- Schema mínimo (Statuspage `/v2/status.json`):

```typescript
z.object({
  status: z.object({
    indicator: z.string().min(1),
    description: z.string().min(1),
  }),
})
```

- Sucesso → `formatProviderStatusLine` → uma linha `indicator — description` (ex.: `none — All Systems Operational`).
- Ignorar demais campos (`page`, `components`, etc.) para não inflar contexto (FR-009).

**Rationale**: FR-008/FR-009; Statuspage documenta `status.indicator` + `status.description`; strings min(1) cobrem edge case “vazios”.

**Alternatives considered**:
- Devolver JSON completo — viola “não inflar contexto”.
- Enum rígido de `indicator` (`none`/`minor`/…) — Statuspage pode evoluir; string + min(1) é suficiente para o plantão.

---

## Decisão 5: Integração no grafo (ToolName / prompt / trace)

**Decisão**:

- Estender `ToolName` em `strategy.ts` com `"check_provider_status"`.
- Incluir a tool no array retornado por `createOpsTools`.
- Atualizar texto de planejamento em `plan-and-execute.ts` para listar a sexta tool.
- Incluir `"check_provider_status"` no `TOOL_NAMES` de `trace.ts` para o rastro não cair no fallback `list_alertas`.

**Rationale**: Sem isso, ações da nova tool degradam o rastro/métricas; prompts desatualizados enviesam o plano.

**Alternatives considered**:
- Só adicionar em `tools.ts` — incompleto (trace/fallback).
- Tool fora do ReAct binding — agente não consegue chamar.

---

## Decisão 6: Descrição da tool (6 regras)

**Decisão**: Seguir as 6 regras da feature 004:

1. Nome `check_provider_status`
2. O quê: consulta status público do provedor
3. Quando usar: suspeita de problema externo; “é o nosso ou do provedor?”; dependência fora do ar
4. Quando não usar: para alertas/incidentes internos do Mercadinho (`list_alertas` / `list_incidents`); não substitui runbook
5. `.describe()` em `provider`
6. `z.enum(["github", "cloudflare"]).default("github")`

**Rationale**: FR-002/FR-003; consistência com tools existentes.

**Alternatives considered**:
- Descrição só “checa status” sem gatilho — modelo usa mal a tool.

---

## Decisão 7: Suíte de testes (sem rede)

**Decisão**: Em `tools.test.ts` (e/ou `provider-status.test.ts`):

| Caso | Fake fetch | Esperado |
|------|------------|----------|
| Sucesso GitHub (default) | `ok` + JSON válido | linha com indicator + description |
| Sucesso Cloudflare | idem para URL cloudflare | idem |
| Timeout | reject `DOMException`/`Error` name `AbortError` (2× se retry) | string de erro; sem throw |
| Payload inválido | `ok` + `{}` ou sem `status` | string de erro |
| Retry smoke (opcional P2) | 1ª 503 / 2ª 200 | linha de sucesso (SC-005) |

Nenhum teste chama as URLs reais.

**Rationale**: FR-012, SC-002/SC-003/SC-005.

**Alternatives considered**:
- Teste de integração com rede — flaky e fora da constitution de CI local.

---

## Clarifications resolvidas

Não restam NEEDS CLARIFICATION no Technical Context. Defaults acima cobrem timeout-retriável, formato da linha, e forma de injeção.
