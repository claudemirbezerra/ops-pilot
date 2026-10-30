# Contract: Montagem dual + CORS

## Montagem

`createApp` registra o mesmo conjunto de rotas em:

| Prefixo | Exemplo |
|---------|---------|
| `/` (raiz) | `POST /chat`, `GET /request/:id`, `POST /approvals/:id` |
| `/opspilot` | `POST /opspilot/chat`, `GET /opspilot/request/:id`, `POST /opspilot/approvals/:id` |

Implementação: um `Router` com as rotas, montado duas vezes. Semântica idêntica nos dois prefixos.

A war room **só** usa o prefixo `/opspilot`.

## CORS

Middleware global (antes das rotas).

### Allow

1. Se `process.env.OPSPILOT_CORS_ORIGINS` for string não vazia após trim: split por `,`, trim cada origem → allowlist. Refletir `Origin` **somente** se estiver na lista.
2. Senão: se request tem header `Origin`, refletir esse valor em `Access-Control-Allow-Origin`.
3. Sem `Origin`: não setar ACAO (clientes não-browser).

### Headers de resposta (quando Origin permitida)

- `Access-Control-Allow-Origin: <origin refletida>`
- `Vary: Origin`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-Request-Id`
- `Access-Control-Expose-Headers: X-Request-Id`

### Preflight

`OPTIONS` para qualquer path sob a app: 204 (ou 200) com os headers acima; sem body.

### Proibido no MVP como política única

`Access-Control-Allow-Origin: *` como único modo (FR-008).

## Testes mínimos

- `POST /chat` e `POST /opspilot/chat` com o mesmo fake → ambos 200.
- Request com `Origin: http://localhost:5173` sem allowlist env → ACAO espelha.
- Allowlist `http://a.example` + Origin `http://b.example` → sem ACAO refletindo b (ou 403 de preflight — preferir omitir ACAO e deixar browser bloquear).
