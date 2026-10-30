# Quickstart: War room web

Validação ponta a ponta após implementar [plan.md](./plan.md). Contratos: [contracts/](./contracts/). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node 22+
- Na raiz do OpsPilot: deps instaladas (`npm install`)
- Em `web/` (após scaffold): `npm install`

## 1. API — typecheck e testes

```bash
npm run typecheck
npm test
```

Esperado: verde. Cobrir (direta ou indiretamente):

- `POST /chat` e `POST /opspilot/chat` equivalentes
- CORS: `Origin` refletida (sem allowlist) ou allowlist via `OPSPILOT_CORS_ORIGINS`
- Caminho gated → **202** com `approvalId` + `pending`
- `POST /opspilot/approvals/:id` approve/deny → **200**; id inválido → **404**; duplicata → **409**
- Turno sem gate → **200** (nunca 202)

## 2. Subir API

```bash
npm run dev
```

Esperado: log em `http://127.0.0.1:3000` (ou `PORT`).

CORS opcional: `OPSPILOT_CORS_ORIGINS=http://localhost:5173` (allowlist). Sem a variável, a API reflete o header `Origin`.

Smoke manual (PowerShell):

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/opspilot/chat `
  -ContentType application/json `
  -Body '{"message":"ping"}'
```

(Com registry real pode demorar / precisar de chave de modelo; use testes com fake para o happy path determinístico.)

## 3. War room

```bash
cd web
npm run dev
```

1. Abrir a origem Vite (ex. `http://localhost:5173`).
2. Engrenagem: URL `http://127.0.0.1:3000` (default); salvar; recarregar e confirmar persistência.
3. Enviar mensagem → resposta na timeline (API com modelo ou stub).
4. **Ver raciocínio** em turno com `trace` → eventos tipados.
5. Forçar 202 (fixture/teste ou pedido que dispare tool gated) → cartão Aprovar/Negar → decisão limpa a pendência.
6. DevTools Network: requests sob `/opspilot/...`; preflight OPTIONS com ACAO adequado.

## 4. Design smoke

- Empty state inicial presente.
- Tema escuro legível (system ou toggle).
- Tab: input → send → ver raciocínio → fechar → aprovar/negar com foco visível.

## Done when

- [ ] `npm run typecheck` + `npm test` verdes na raiz
- [ ] Dual mount + CORS verificados
- [ ] 202 + approvals verificados
- [ ] War room: chat, trace, cartão 202, engrenagem
- [ ] Design instructions respeitadas no aceite P2
