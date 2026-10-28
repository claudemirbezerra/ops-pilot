# Research: Orçamento de contexto por seção

**Phase 0 output for** `specs/012-orcamento-contexto/plan.md`

---

## Contexto

Hoje `runChat` (`src/services/chat-service.ts`) monta o prompt assim:

1. `selectHistoryWindow(prior, message)` — até `HISTORY_LIMIT=8`, **incluindo** a mensagem atual
2. `renderHistoryPrompt(window)` / `renderMemoryPrompt(recalled)` / `renderSummaryPrompt(summary.text)`
3. `parts = [memory, summary, history].filter(Boolean).join("\n\n")` → `strategy.run(prompt)`

`estimateTokens` (chars÷4) já alimenta `contextBreakdown`. Recall devolve `{ fact, score }`, mas o score é descartado no render. Não existe `context-builder.ts`. System prompts das estratégias (`SystemMessage` em plan-and-execute / react, etc.) ficam **dentro** do agente, não no string composto pelo chat.

A feature pede um montador único com tetos por seção, sistema/mensagem intocáveis, e cortes ordenados.

---

## Decisão 1: Módulo puro `src/context/context-builder.ts` no caminho de `runChat`

**Decisão**: Criar `buildContext(input, budgets) → { prompt, sections }` (nomes finais no contrato). `runChat` é o único wiring de produção: após recall/resumo/janela, chama o builder e passa `prompt` a `strategy.run`. Todas as estratégias passam pelo montador porque todas já entram por `runChat`.

**Rationale**: Spec exige um caminho para TODAS as estratégias; o ponto comum já é `runChat`. Evita refatorar cada agente para conhecer budgets.

**Alternatives considered**:
- Cada estratégia chama o builder — duplica wire e quebra o “mesmo caminho”.
- Middleware LangChain de trim — acopla a framework e dificulta testes puros de ordem de corte.

---

## Decisão 2: Cinco seções; mensagem fora da janela cortável

**Decisão**: Entrada estruturada:

| Seção | Cortável? | Conteúdo |
|-------|-----------|----------|
| `system` | Não | String (pode ser `""` no wire atual do chat) |
| `message` | Não | Texto atual do plantonista |
| `summary` | Sim | Texto do resumo (já renderizado ou cru + render no builder — ver Decisão 5) |
| `window` | Sim | Mensagens **anteriores** da janela (sem a mensagem atual) |
| `memory` | Sim | Itens `{ fact, score }` |

Ordem de composição do `prompt` (preserva produto atual + seções protegidas):

1. `system` (se não vazio)
2. bloco memória (pós-corte)
3. bloco resumo (pós-corte)
4. janela renderizada (pós-corte) + mensagem atual (sempre)

Na prática, se `system` for vazio (wire chat atual), o string fica equivalente a `[memory, summary, historyWithCurrent]` como hoje, só que com orçamento.

**Rationale**: Spec trata “mensagem” e “janela” como seções distintas; incluir a atual na janela cortável arrisca removê-la se um item único não couber. Separar garante intocável.

**Alternatives considered**:
- Janela inclui current e regra especial “nunca dropar a última user” — mais frágil e menos alinhada às 5 seções.
- Exigir que estratégias passem `system` já nesta feature — escopo maior; API do builder aceita `system` para testes e uso futuro; chat pode passar `""`.

---

## Decisão 3: Env `CONTEXT_BUDGET_*` via `process.env`, defaults 200/1200/300

**Decisão**: Nomes:

- `CONTEXT_BUDGET_SUMMARY` → default `200`
- `CONTEXT_BUDGET_WINDOW` → default `1200`
- `CONTEXT_BUDGET_MEMORY` → default `300`

`resolveContextBudgets(env = process.env)`: parse int finito ≥ 0; inválido/ausente → default. **Não** usar `dotenv` / ler arquivo `.env` (constituição VI).

Não há `CONTEXT_BUDGET_SYSTEM` / `_MESSAGE`.

**Rationale**: Spec pede prefixo `CONTEXT_BUDGET_*` e esses três tetos. `process.env` é o padrão do projeto (`OPSPILOT_DB`).

**Alternatives considered**:
- Orçamento passado só por parâmetro de `createApp` — útil para testes, mas spec exige env; testes injetam mapa env no resolve puro.
- Um único `CONTEXT_BUDGET` global — fora de escopo.

---

## Decisão 4: Políticas de corte

**Decisão**:

1. **Janela**: enquanto `estimateTokens(renderHistoryPrompt(window)) > budget`, remove o item no índice `0` (mais antigo). Se o primeiro item sozinho ainda excede o teto, remove-o (não entra). Para.
2. **Memória**: ordenar por `score` ASC, `index` ASC (desempate estável). Remover da frente (menor score) até `estimateTokens(renderMemoryPrompt(rest)) ≤ budget`. Item único que não cabe → fora.
3. **Resumo**: se `estimateTokens(summaryBlock) > budget`, truncar o **texto do resumo** (não o prefixo do rótulo, se houver) para no máximo `budget * 4` caracteres (inverso da heurística), depois re-render se necessário; resultado final `estimateTokens(block) ≤ budget`. Preferir prefixo (início do resumo).
4. **Sistema / mensagem**: cópia integral; nunca truncar.

**Rationale**: Alinhado à spec; `* 4` é o inverso exato de `floor(len/4)` no pior caso seguro (teto em tokens estimados ⇒ `budget * 4` chars ⇒ `estimateTokens ≤ budget`).

**Alternatives considered**:
- Truncar resumo no meio / pelo fim — perde decisões no início do bloco; prefixo é o default razoável da assumption da spec.
- Re-chamar sumarizador LLM para caber — fora de escopo (assumption: truncar basta).

---

## Decisão 5: Reutilizar renders existentes; breakdown pós-corte

**Decisão**: Builder usa `renderHistoryPrompt`, `renderSummaryPrompt`, `renderMemoryPrompt`. `contextBreakdown` em `runChat` passa a estimar as strings **já orçadas** (history = janela renderizada ± mensagem conforme contrato do builder; memory/summary pós-corte). Assim breakdown ≤ tetos quando o conteúdo original excedia.

**Rationale**: Uma fonte de verdade de formatação; métricas 010/011 continuam corretas e passam a refletir o orçamento.

**Alternatives considered**:
- Breakdown do conteúdo pré-corte — mentiria o prompt real enviado.
- Mudar labels dos blocos — fora de escopo.

---

## Decisão 6: Testes focados no builder; wire mínimo

**Decisão**: `context-builder.test.ts` com tetos baixos (ex.: window 5, memory 5, summary 5) e fixtures de idades/scores; assert sistema/mensagem intactos e ordem de remoção. Teste de `resolveContextBudgets` (válido / inválido / default). Wire em `chat-service` coberto indiretamente se já houver eco de prompt; opcional um assert HTTP de breakdown ≤ default quando fixture grande — não bloqueante se o unitário do builder for sólido.

**Rationale**: Spec US4: “tetos baixos cortam na ordem certa” — unitário puro é a prova direta.

**Alternatives considered**:
- Só testes HTTP — mais lentos e acoplados a store/estratégia.

---

## Resolução de clarificações

Nenhum `NEEDS CLARIFICATION` restante no Technical Context do plan. Desconhecidos de integração resolvidos pelas decisões acima.
