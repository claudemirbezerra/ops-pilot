# Contract: War room UI (`web/`)

## Stack / layout

- Pasta `web/`: Vite + React + TypeScript.
- Estilos: tokens semânticos + escala `space-*` conforme `.cursor/rules/design.instructions.mdc`.
- Sem auth no MVP.

## Config (engrenagem)

| Item | Regra |
|------|-------|
| Campo | URL base da API |
| Default | `http://127.0.0.1:3000` |
| Persistência | `localStorage` |
| Validação | URL absoluta http(s); erro inline se inválida |
| Normalização | Remover `/` final; paths = `{base}/opspilot/...` |

## Chat

- `POST {base}/opspilot/chat` com `{ message }` (+ opcionais se a UI expor).
- **200**: append mensagens user/assistant; guardar `trace` / `requestId` do turno.
- **202**: append contexto + **ApprovalCard** (`approvalId`, `pending.description`); bloquear novo send até resolver ou descartar pendência.
- **4xx/5xx / rede**: banner/erro acionável + retry; não limpar histórico da sessão.

## Ver raciocínio

- Ação por turno que tenha `trace.length > 0`.
- Abre painel/drawer com lista tipada (`type` + conteúdo relevante).
- Sem trace: CTA desabilitado ou empty “sem eventos neste turno”.
- Fecha com Escape; foco visível; teclado ok.

## ApprovalCard

- Primária: **Aprovar**; secundária: **Negar** (hierarquia de design).
- `POST {base}/opspilot/approvals/{approvalId}` `{ decision: "approve" | "deny" }`.
- Sucesso: remove pendência; mostra `answer` do 200.
- Erro: mensagem no cartão; pendência permanece até sucesso ou discard explícito.

## Empty / dark / a11y

- Empty inicial: ícone discreto + título + frase + foco no input.
- Dark: tokens `bg`/`surface`/`fg`/`danger`/… (system preference e/ou toggle simples).
- Live region para resposta do assistente / resultado da decisão.
- Interativos ≥ 44px; labels em ícones (`aria-label` na engrenagem).
