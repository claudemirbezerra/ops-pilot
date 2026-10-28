# Data Model: Orçamento de contexto por seção

**Feature**: `012-orcamento-contexto`  
**Persistência**: nenhuma entidade nova em SQLite. Modelo em memória na montagem do prompt.

---

## ContextBudgets

Tetos de tamanho estimado (unidade = `estimateTokens` = chars÷4) por seção cortável.

| Campo | Tipo | Default | Origem env |
|-------|------|---------|------------|
| `summary` | number (inteiro ≥ 0) | `200` | `CONTEXT_BUDGET_SUMMARY` |
| `window` | number (inteiro ≥ 0) | `1200` | `CONTEXT_BUDGET_WINDOW` |
| `memory` | number (inteiro ≥ 0) | `300` | `CONTEXT_BUDGET_MEMORY` |

**Validação**: string ausente, vazia, não-numérica, não-finita ou &lt; 0 → default da seção. Não há campos para system/message.

---

## ContextSectionInput

Entrada do montador (uma montagem = um turno).

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `system` | `string` | sim (pode `""`) | Intocável |
| `message` | `string` | sim | Intocável; pedido atual |
| `summary` | `string` | sim (pode `""`) | Texto do resumo **sem** exigir prefixo; `""` = seção ausente |
| `window` | `ConversationMessage[]` | sim (pode `[]`) | Só mensagens anteriores; ordem cronológica ASC (índice 0 = mais antiga) |
| `memory` | `MemoryItem[]` | sim (pode `[]`) | Itens com score |

### ConversationMessage (reuso)

Já existente em `domain/types`: `{ role: "user" \| "assistant"; content: string }` (e metadados se houver — o builder só precisa de role/content para render).

### MemoryItem

| Campo | Tipo | Notas |
|-------|------|-------|
| `fact` | `string` | Conteúdo lembrado |
| `score` | `number` | Relevância do recall; maior = mais relevante |

---

## BuiltContext (saída)

| Campo | Tipo | Notas |
|-------|------|-------|
| `prompt` | `string` | Texto composto final enviado a `strategy.run` |
| `sections.system` | `string` | Igual à entrada |
| `sections.message` | `string` | Igual à entrada |
| `sections.summary` | `string` | Bloco renderizado pós-orçamento (ou `""`) |
| `sections.window` | `string` | Bloco renderizado da janela pós-orçamento (sem a mensagem atual) |
| `sections.memory` | `string` | Bloco renderizado pós-orçamento (ou `""`) |
| `kept.window` | `ConversationMessage[]` | Mensagens que restaram |
| `kept.memory` | `MemoryItem[]` | Itens que restaram |

**Relação com métricas**: `contextBreakdown.history` estima a parte de histórico efetivamente no prompt (janela renderizada + mensagem atual, na forma em que entram no `prompt`); `.summary` / `.memory` estimam `sections.summary` / `sections.memory`.

---

## Regras de estado (por montagem)

Não há máquina de estados persistente. Por chamada:

1. Resolver budgets (env ou defaults).
2. Copiar system + message intactos.
3. Aplicar corte de summary → window → memory (ordem entre seções independente; cada uma só olha o próprio teto).
4. Compor `prompt` na ordem: system? → memory? → summary? → (window + message).
5. Omitir seções vazias (sem inventar texto).

### Empate de score

Ordenação estável para remoção: `score` ASC, depois índice original ASC. Mesma entrada → mesma saída.

### Item único &gt; teto

Remove o item (janela/memória) ou trunca (resumo). Nunca aumenta o teto. Nunca corta system/message.

---

## Relacionamentos

```text
runChat
  ├─ conversationStore → summary text, prior messages
  ├─ memoryStore.recall → MemoryItem[] (fact + score)
  └─ buildContext(ContextSectionInput, ContextBudgets) → BuiltContext.prompt
         └─ strategy.run(prompt)
```

Sem FK / tabelas novas.
