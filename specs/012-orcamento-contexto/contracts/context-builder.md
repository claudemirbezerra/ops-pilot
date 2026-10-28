# Contract: ContextBuilder (`src/context/context-builder.ts`)

API interna pura. Consumidor de produção: `runChat`. Sem I/O. Unidade de teto = `estimateTokens` (chars÷4).

## Tipos (conceituais)

```ts
type ContextBudgets = {
  summary: number;
  window: number;
  memory: number;
};

type MemoryItem = { fact: string; score: number };

type ContextSectionInput = {
  system: string;
  message: string;
  summary: string; // texto cru do resumo; "" = ausente
  window: readonly ConversationMessage[]; // sem a mensagem atual
  memory: readonly MemoryItem[];
};

type BuiltContext = {
  prompt: string;
  sections: {
    system: string;
    message: string;
    summary: string; // bloco renderizado ou ""
    window: string;  // bloco renderizado da janela ou ""
    memory: string;  // bloco renderizado ou ""
  };
  kept: {
    window: ConversationMessage[];
    memory: MemoryItem[];
  };
};
```

## `resolveContextBudgets(env?: Record<string, string | undefined>): ContextBudgets`

Ver [context-budget-env.md](./context-budget-env.md).

## `buildContext(input: ContextSectionInput, budgets: ContextBudgets): BuiltContext`

### Invariantes

1. `sections.system === input.system` e `sections.message === input.message` (igualdade estrita de string).
2. `estimateTokens(sections.summary) ≤ budgets.summary` (se `sections.summary === ""`, OK).
3. `estimateTokens(sections.window) ≤ budgets.window`.
4. `estimateTokens(sections.memory) ≤ budgets.memory`.
5. Determinístico: mesmos `input` + `budgets` ⇒ mesmo `BuiltContext`.

### Corte — janela

- Enquanto a estimativa do `renderHistoryPrompt(kept.window)` &gt; `budgets.window` e `kept.window.length > 0`, remove o elemento no índice `0`.
- `sections.window` = `renderHistoryPrompt(kept.window)` ou `""` se vazio.

### Corte — memória

- Ordenar cópia por `(score ASC, index ASC)`; remover da frente até `estimateTokens(renderMemoryPrompt(kept)) ≤ budgets.memory`.
- `kept.memory` preserva ordem relativa dos sobreviventes como na entrada (não a ordem de remoção).
- `sections.memory` = `renderMemoryPrompt(kept.memory)` ou `""`.

### Corte — resumo

- Se `input.summary` trim vazio → `sections.summary = ""`.
- Senão: partir de `renderSummaryPrompt(input.summary)`; se estimativa &gt; teto, truncar o corpo do resumo (após o rótulo) a no máximo `budgets.summary * 4` caracteres de conteúdo total do bloco de forma que `estimateTokens(resultado) ≤ budgets.summary` (prefixo).

### Composição de `prompt`

Partes não vazias, nesta ordem, unidas por `"\n\n"`:

1. `sections.system`
2. `sections.memory`
3. `sections.summary`
4. Combinação da janela + mensagem atual:
   - Se `sections.window` não vazio: `sections.window + "\n" + render da mensagem atual` (mesmo rótulo `Plantonista:` que `renderHistoryPrompt` usa para `user`)
   - Senão: só a linha da mensagem atual (`Plantonista: …`)

A mensagem atual **sempre** entra no `prompt` (mesmo com janela vazia), desde que `message` seja o pedido do turno (chat já evita blank antes).

### Fora de escopo

- Orçamento global somado
- Truncar system/message
- Alterar `HISTORY_LIMIT` ou recall/sumarização
- Ler arquivo `.env`

## Exemplos de comportamento (teste)

| Cenário | Esperado |
|---------|----------|
| Tetos altos, tudo cabe | `kept` = entrada; system/message iguais |
| Window 3 msgs, budget que só cabe 1 | Sobrevive a mais recente das 3; as duas antigas saem |
| Memory scores 0.9, 0.5, 0.2, budget apertado | Sai 0.2 primeiro, depois 0.5 |
| Summary enorme | Bloco final ≤ teto; system/message intactos |
| system longo + budgets 0 nas cortáveis | system e message intactos; cortáveis `""` ou mínimos que caibam em 0 (só vazio) |
