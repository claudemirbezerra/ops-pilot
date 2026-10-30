# Research: War room web

**Phase 0 output for** `specs/016-war-room-web/plan.md`

---

## Contexto

OpsPilot hoje expõe `POST /chat` e `GET /request/:id` na raiz do Express (`src/http/server.ts`), sem CORS e sem prefixo `/opspilot`. Não há resposta 202 nem endpoint de aprovação. Tools (`open_incident`, `resolver_incident`, etc.) executam de imediato no ReAct / Plan-and-Execute. Não existe pasta `web/`.

A spec pede: war room Vite+React+TS em `web/`; chat via `/opspilot/chat`; **Ver raciocínio** com trace tipado; 202 → cartão aprovar/negar; engrenagem com URL da API; montagem dual raiz + `/opspilot`; CORS refletindo Origin / allowlist; gate explícito nas tools; endpoint dedicado de decisão.

---

## Decisão 1: Extrair rotas e montar em `/` e `/opspilot`

**Decisão**: Fatorar handlers em um `Router` (ou função `registerOpsPilotRoutes(router)`) e fazer `app.use(router)` + `app.use("/opspilot", router)` no `createApp`. War room chama só `/opspilot/...`. Testes legados em `/chat` continuam verdes.

**Rationale**: FR-007/FR-016 exigem dual mount sem duplicar lógica. Express Router é o padrão mínimo sem dep nova.

**Alternatives considered**:
- Só `/opspilot` e migrar todos os testes — quebra FR-016.
- Proxy reverso externo — fora do escopo do repo/MVP.
- Duplicar `app.post` com paths literais — drift garantido.

---

## Decisão 2: CORS hand-rolled (Origin refletida ou allowlist)

**Decisão**: Middleware próprio (sem pacote `cors`). Política:
1. Se `OPSPILOT_CORS_ORIGINS` (lista separada por vírgula) estiver definida e não vazia → allowlist; refletir só se `Origin` ∈ lista.
2. Senão → refletir qualquer `Origin` presente (dev plantão local).
3. Sem `Origin` (curl/testes Node) → não exige header CORS.
4. Responder preflight `OPTIONS` com métodos `GET,POST,OPTIONS` e headers necessários (`Content-Type`, `X-Request-Id`).
5. Não usar `Access-Control-Allow-Origin: *` como política única (FR-008).

**Rationale**: Spec + clarify; zero dep; alinhado a “não ler `.env`” no sentido de não *commitar* secrets — variáveis de processo já usadas (`PORT`, `OPSPILOT_DB`) continuam válidas; allowlist via env não é secret.

**Alternatives considered**:
- Pacote `cors` — dep nova sem ganho.
- Só localhost:5173 fixo — frágil (porta Vite muda).
- `*` sempre — rejeitado no clarify.

---

## Decisão 3: Gate explícito = conjunto de tool names (approve-before-invoke)

**Decisão**: Constante/puro `TOOLS_REQUIRING_HUMAN_APPROVAL: ReadonlySet<ToolName>` contendo no MVP **`open_incident`** e **`resolver_incident`** (mutações de incidente). Em ReAct / Plan-and-Execute, **antes** de `tool.invoke`, se o nome ∈ set → **não** executa; encerra o turno com resultado de pendência (ver Decisão 4). Tools de leitura (`list_alertas`, `list_incidents`, `consultar_runbook`, `check_provider_status`, `forget_preference`) seguem síncronas.

**Rationale**: Clarify B — gate explícito marcado, não “qualquer tool” nem flag do cliente. Mutações de incidente são o risco operacional óbvio e já existem no domínio.

**Alternatives considered**:
- LangGraph `interrupt()` / checkpoint persistido — correto a médio prazo, mas exige checkpointer e muda o grafo inteiro; MVP cabe em pause-before-invoke + store de aprovação.
- Flag `requireApproval` no body do chat — rejeitado (clarify).
- Stub só UI sem gate real — rejeitado (clarify A API+UI).

---

## Decisão 4: Resultado de pendência no service → HTTP 202

**Decisão**: Estender o contrato interno de `runChat` / strategy para discriminar:
- sucesso → `{ kind: "completed", answer, trace, metrics, conversationId? }`
- pendência → `{ kind: "pending_approval", approvalId, pending: { tool, args, description }, answer?, trace, metrics, conversationId?, requestId? }`

HTTP: `kind === "pending_approval"` → **202** com corpo tipado (contrato). Sucesso continua **200**. Persistência de request/trace (015) no caminho 202: gravar o que já existe no `trace` parcial + métricas; `requestId` no header/corpo como hoje.

**Rationale**: Mantém Zod/erros atuais; UI distingue 202 de 4xx/5xx; testável com strategy fake.

**Alternatives considered**:
- 200 com `{ status: "pending" }` — foge do enunciado “202 vira cartão”.
- WebSocket/SSE para HITL — fora do escopo.

---

## Decisão 5: `ApprovalStore` in-memory + endpoint dedicado

**Decisão**:
- Interface `ApprovalStore` com `save`, `get`, `resolve`.
- Implementação MVP: `InMemoryApprovalStore` (Map no processo). Persistência SQLite de approvals fica fora do MVP (reinício perde pendências — documentado).
- `POST /approvals/:id` e `POST /opspilot/approvals/:id` com body Zod `{ decision: "approve" | "deny" }`.
- Approve: executa a tool pendente (via OpsStore/tools), monta observation, devolve **200** `{ requestId?, answer, trace, metrics, conversationId?, decision: "approve" }`.
- Deny: observation de negativa, **200** com `decision: "deny"` e answer explicativa.
- Id desconhecido → `ApprovalNotFoundError` → 404.
- Já resolvido → `ApprovalAlreadyResolvedError` → 409.

**Rationale**: Clarify A (endpoint dedicado). In-memory basta para war room + testes sem nova tabela; alinhado a VIII (fatia pequena).

**Alternatives considered**:
- Continuar no mesmo `POST /chat` — rejeitado.
- SQLite approvals já no MVP — útil, mas não bloqueia aceite; pode ser converge posterior.
- LangGraph resume com thread_id — acoplamento alto agora.

---

## Decisão 6: War room em `web/` (Vite + React + TS) separado do `package.json` raiz

**Decisão**: App em `web/` com `package.json` próprio (Vite, React, TypeScript). Scripts no root opcionais (`npm run web` → workspace/filter ou `npm --prefix web`). Cliente HTTP tipado contra contratos; `localStorage` para URL base; paths sempre `/opspilot/...`. Design tokens CSS conforme `.cursor/rules/design.instructions.mdc`.

**Rationale**: Spec/Assumptions; não polui deps do agente Node com React. Constitution stack obrigatória permanece no backend; UI é superfície adicional mandatória pelo pedido.

**Alternatives considered**:
- React no mesmo package raiz — mistura toolchains e typecheck.
- SPA servida pelo Express estático sem Vite — pior DX; Vite pedido explicitamente.
- Next.js — overkill.

---

## Decisão 7: Trace na UI a partir do corpo do turno (não GET obrigatório)

**Decisão**: **Ver raciocínio** renderiza `trace: TraceEvent[]` já retornado no 200/202. `GET /opspilot/request/:id` fica disponível (espelho) mas não é pré-requisito do MVP da war room.

**Rationale**: Assumption da spec; reduz acoplamento ao 015.

**Alternatives considered**: Sempre refetch GET — latência extra e falha se persistência falhar.

---

## Decisão 8: Default da URL da API na engrenagem

**Decisão**: Default `http://127.0.0.1:3000` (mesmo host do `src/index.ts`). Validação: URL absoluta `http:`/`https:`; strip trailing slash ao montar paths.

**Rationale**: Zero config no happy path local; FR-006/012.

**Alternatives considered**: Campo vazio obrigatório — atrito desnecessário no plantão local.

---

## NEEDS CLARIFICATION

Nenhum restante — clarify + decisões acima cobrem escopo de plan.
