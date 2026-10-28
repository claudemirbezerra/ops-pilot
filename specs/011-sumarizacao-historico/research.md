# Research: Sumarização de histórico (pruning)

**Phase 0 output for** `specs/011-sumarizacao-historico/plan.md`

---

## Contexto

A conversa persistente (007) grava mensagens e compõe o prompt com `HISTORY_LIMIT = 12` em `src/services/history-prompt.ts`; `runChat` pede `lastMessages(id, HISTORY_LIMIT)`, monta a janela e conta `historyMessages`. Memória semântica (008) prepende o bloco de recall; medição (010) estima `contextBreakdown.history` / `.memory`. Não há resumo, cursor de consolidação nem evento `summarize` em `TraceEvent`. O extrator de aprendizado (009) já estabelece o padrão de porta injetável + fake nos testes via `CreateAppOptions`.

Esta fase fecha: janela 8, schema de `conversation_summaries`, gatilho de lote de 8 egressos, porta do sumarizador, falha sem corromper, ordem do prompt e extensão do rastro/breakdown.

---

## Decisão 1: `HISTORY_LIMIT = 8` no mesmo módulo puro

**Decisão**: Alterar `HISTORY_LIMIT` de `12` para `8` em `src/services/history-prompt.ts`. `selectHistoryWindow` / `renderHistoryPrompt` permanecem; testes de 007/HTTP que fixam 12 passam a 8. `metrics.historyMessages` fica no intervalo 0–8.

**Rationale**: A spec redefine a janela bruta efetiva. Um único constante evita divergência entre store fetch, composição e métrica.

**Alternatives considered**:
- Constante nova `SUMMARY_WINDOW` ao lado de `HISTORY_LIMIT = 12` — dois tetos contradizem a spec.
- Parâmetro no body `/chat` — fora de escopo.

---

## Decisão 2: Tabela `conversation_summaries` no `SqliteConversationStore`

**Decisão**: DDL idempotente no mesmo construtor de `SqliteConversationStore` (mesmo `OPSPILOT_DB` / `:memory:`):

```sql
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
  summary TEXT NOT NULL,
  covered_through_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

API do store (estende `ConversationStore`):

- `getSummary(conversationId): { text: string; coveredThroughId: number } | null`
- `upsertSummary(conversationId, text, coveredThroughId): void` — substitui o resumo ativo (um por conversa)
- `listUnsummarizedOutsideWindow(conversationId, windowSize, coveredThroughId): Array<ConversationMessage & { id: number }>` — mensagens com `id > coveredThroughId` que **não** estão entre as `windowSize` mais recentes, ordenadas por `id` ASC

Conversa inexistente → mesmos erros de domínio já usados (`ConversationNotFoundError`).

**Rationale**: Um resumo ativo + cursor `covered_through_id` torna o lote de 8 egressos determinístico sem contador volátil. Fica no guarda de conversa (mesmo arquivo, FK, testes `:memory:`).

**Alternatives considered**:
- Store separado só de resumos — segunda conexão no mesmo ficheiro sem ganho; testes e wiring duplicados.
- Contador `egress_count` sem cursor de id — frágil com appends concorrentes e difícil de reconciliar após falha.
- Histórico versionado de resumos — fora da spec (FR-007: um vigente).

---

## Decisão 3: Gatilho após append — lote de 8 fora da janela

**Decisão**: Em `runChat`, **depois** do append user+assistant no caminho 200:

1. `covered = getSummary()?.coveredThroughId ?? 0`
2. `pending = listUnsummarizedOutsideWindow(id, 8, covered)`
3. Se `pending.length < 8` → não sumariza; não emite `summarize`
4. Se `pending.length >= 8` → `batch = pending.slice(0, 8)`; chama o sumarizador com `{ previousSummary, egressBatch: batch }`; `upsertSummary(id, newText, batch[7].id)`; acrescenta `{ type: "summarize", content: newText }` (ou conteúdo curto) ao `trace` **antes** do return

Antes da estratégia: carrega o resumo **já persistido** (se houver) e inclui no prompt. A consolidação deste turno só afeta o **próximo** prompt — coerente com “nunca a cada request” e com ids estáveis pós-append.

Pedido vazio / timeout / erros de borda: sem append → sem consolidação.

**Rationale**: Contar egressos por mensagens gravadas fora da janela (assumptions da spec). Primeira consolidação típica quando há ≥ 16 mensagens (8 fora + 8 na janela). Lotes seguintes a cada +8 fora do cursor.

**Alternatives considered**:
- Sumarizar antes do append com base na janela do prompt — cursor sem ids novos; mais fácil errar o lote.
- Sumarizar a cada mensagem que “cai” — viola “nunca a cada request” / lote de 8.
- Fire-and-forget como o aprendizado 009 — o evento `summarize` precisa estar no `trace` do mesmo 200; por isso o passo é `await` no caminho de sucesso.

---

## Decisão 4: Porta `ConversationSummarizer` + fake; falha não corrompe

**Decisão**:

```ts
type SummarizeInput = {
  previousSummary: string; // "" se primeira consolidação
  egressBatch: ConversationMessage[]; // exatamente 8
};

type ConversationSummarizer = {
  summarize(input: SummarizeInput): Promise<string>;
};
```

- Produção: `createLlmConversationSummarizer()` — modelo já usado no projeto; system prompt pede ~150 tokens (heurística chars÷4 ≈ 600 chars), preservar decisões, fatos e pendências; merge explícito com `previousSummary`.
- Testes / `createApp({ conversationSummarizer })`: fake determinístico que concatena ou devolve texto fixo e conta chamadas.
- Default em `runChat` / `createApp` se omitido: implementação LLM (como `learningExtractor`).
- Se `summarize` lança ou devolve branco: **não** chama `upsertSummary`; resumo anterior intacto; **não** emite `summarize`; log `console.error` com prefixo `[history-summarizer]`; o 200 da estratégia permanece.

Alvo ~150 tokens: instrução no prompt + verificação nos testes do fake (tamanho / contrato de merge). Sem truncagem dura obrigatória na v1 (modelo pode variar levemente).

**Rationale**: Espelha Critic / LearningExtractor (SC de teste fake). Falha soft cumpre o edge case da spec sem degradar o plantão a 5xx por consolidação.

**Alternatives considered**:
- Heurística extractiva sem LLM — frágil para “decisões/fatos/pendências”.
- Falhar o turno HTTP se o sumarizador falhar — pior UX; a estratégia já respondeu.
- Truncar mecanicamente a 600 chars sempre — pode cortar pendências; reservar para evolve se necessário.

---

## Decisão 5: Bloco de resumo no prompt + `TraceEvent` + breakdown opcional

**Decisão**:

Ordem do texto composto entregue à estratégia:

```text
[Memória do plantonista: …]     # se userId / recall (008)
[Resumo da conversa:\n…]        # se getSummary()?.text não vazio
Plantonista: … / Copiloto: …    # janela ≤ 8 (007/011)
```

- Helper puro `renderSummaryPrompt(text: string): string` junto de `history-prompt.ts` (ou módulo vizinho de composição).
- Estender `TraceEvent` com `{ type: "summarize"; content: string }` em `src/agents/strategy.ts`. HTTP já serializa `trace` — sem campo novo no envelope.
- Estender `contextBreakdown` com `summary: number` (`estimateTokens` do bloco de resumo; `0` se ausente). Chaves `history` e `memory` permanecem; `history` continua a estimar só o bloco das mensagens brutas.

**Rationale**: Spec exige resumo distinguível, evento `summarize` e permite breakdown da fonte. Uma chave `summary` alinha observabilidade (010) sem mudar o body do request.

**Alternatives considered**:
- Embutir o resumo como pseudo-mensagem `assistant` na janela — mistura falantes e polui `historyMessages`.
- Métrica dedicada fora de `contextBreakdown` — menos consistente com 010.
- Omitir `summary` no breakdown — spec permite, mas o custo de acrescentar a chave é baixo e ajuda o ensaio de conversa longa.

---

## Decisão 6: Arena / bench / reflexão

**Decisão**: Arena e bench não usam `runChat` nem o store de conversa — permanecem sem pruning (FR-012). Reflexão (`reflect`) continua a receber o mesmo texto já composto (resumo + janela); não dispara consolidação extra; `historyMessages` conta uma vez; consolidação só no append pós-sucesso do turno completo (como hoje o append).

**Rationale**: Spec e padrão 007/009.

**Alternatives considered**:
- Sumarizar também na arena — fora de escopo e sem `conversationId`.

---

## Resolução de clarificações

| Tema | Resolução |
|------|-----------|
| Falha do sumarizador | Soft-fail: 200 da estratégia, resumo intacto, sem evento `summarize` |
| `contextBreakdown.summary` | Incluir (0 se sem bloco) |
| Quando contar egressos | Pós-append, mensagens gravadas fora da janela 8 com `id > covered_through_id` |
| Primeira consolidação | Sem `previousSummary` (`""`); lote das 8 mais antigas fora da janela |

Nenhum **NEEDS CLARIFICATION** restante para Phase 1.
