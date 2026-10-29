# Data Model: Resiliência de modelo

**Feature**: `014-resiliencia-modelo`  
**Persistência**: nenhuma entidade nova em SQLite. Estado só em memória na sessão da fábrica / resposta do turno.

---

## ModelConfig

| Campo | Tipo | Origem | Obrigatório |
|-------|------|--------|-------------|
| `apiKey` | `string` (trim, não vazio) | `OPENROUTER_API_KEY` | sim |
| `primaryModel` | `string` (trim, não vazio) | `OPENROUTER_MODEL` | sim |
| `fallbackModel` | `string` \| `undefined` | `OPENROUTER_MODEL_FALLBACK` | não |

**Validação**:

- Ausência de `apiKey` ou `primaryModel` → `MissingModelConfigError` (já existente).
- `fallbackModel`: `undefined` / `""` / só espaços → sem reserva (`undefined`). Caso contrário, string trimada (pode ser igual ao principal).

---

## ModelSession (estado de observação)

Estado mutável por instância da fábrica, resetável logicamente a cada criação (nova chamada a `createModel` / `createCountingModel`).

| Campo | Tipo | Notas |
|-------|------|-------|
| `modelUsed` | `string` \| `undefined` | Último id que completou invoke com sucesso |
| `fallbackOccurred` | `boolean` | `true` se o reserva atendeu pelo menos uma vez |
| `primaryModel` | `string` | Cópia do config |
| `fallbackModel` | `string` \| `undefined` | Cópia do config |

**Transições** (por invoke bem-sucedido):

1. Sucesso no elo principal → `modelUsed = primaryModel`; `fallbackOccurred` inalterado (fica `false` se nunca usou reserva).
2. Sucesso no elo reserva → `modelUsed = fallbackModel`; `fallbackOccurred = true`.
3. Falha total → lança `ModelUnavailableError`; `modelUsed` pode permanecer do sucesso anterior da mesma sessão (callers do turno que falhou não devolvem 200).

---

## TraceEvent `fallback` (extensão)

Novo membro da união `TraceEvent`:

| Campo | Tipo | Notas |
|-------|------|-------|
| `type` | `"fallback"` | Discriminador |
| `from` | `string` | Id do principal |
| `to` | `string` | Id do reserva |
| `node` | `TraceNode` \| omitido | Etapa (`router`, `react`, …) quando conhecida |

Emitido **somente** quando `fallbackOccurred` torna-se relevante para o rastro daquele caminho (pelo menos uma troca principal→reserva com sucesso no reserva). Não emitir se só o principal atendeu.

---

## Metrics `modelUsed` (extensão)

Extensão de `Metrics` / métricas do chat:

| Campo | Tipo | Quando |
|-------|------|--------|
| `modelUsed` | `string` | Turno **200** que consultou o modelo: id do modelo da resposta (último sucesso da estratégia). |
| `llmCalls` / `latencyMs` / `promptTokens` / … | existentes | Inalterados na semântica |

Pedido vazio / caminhos sem consulta: `modelUsed` **omitido** (não `""`).

---

## ModelUnavailableError

Erro de domínio (não persistido).

| Campo | Valor |
|-------|--------|
| `name` | `ModelUnavailableError` |
| `message` | Mensagem estável para a borda (ex.: `Modelo indisponível.`) |

Relação: distinto de `MissingModelConfigError` (config) e de `EmbeddingUnavailableError` (embedding). Ambos 503 na borda HTTP, mensagens diferentes.

---

## Relacionamentos

```text
process.env
  └─ ModelConfig
        └─ composeResilientModel → Runnable + ModelSession
              ├─ strategies / router / summarizer (invoke)
              │     ├─ TraceEvent "fallback"?
              │     └─ Metrics.modelUsed
              └─ esgota → ModelUnavailableError → HTTP 503
```

Sem FK / tabelas novas.
