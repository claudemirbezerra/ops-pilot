# Contract: Learning reflector

Extração estruturada pós-resposta e *remember* assíncrono. Modelo: [data-model.md](../data-model.md). Store: contrato 008 `memory-store.md`.

## LearningExtractor

```ts
type LearningDecision = {
  hasLearning: boolean;
  fact: string;
};

type LearningExtractor = {
  extract(userMessage: string): Promise<LearningDecision>;
};
```

- Entrada: texto da **última mensagem do usuário** do turno (não o histórico completo, não a resposta do assistente).
- Saída: exatamente `hasLearning` + `fact` (Zod + `withStructuredOutput` na implementação LLM).
- Default produção: `createLlmLearningExtractor()` via `createModel()`.
- Testes: stub injetável em `runChat` / `createApp({ learningExtractor })`.

### System prompt (comportamento obrigatório)

- `hasLearning: true` só para preferência/fato **durável**.
- Pedido pontual de plantão → `hasLearning: false`, `fact: ""`.
- Segredo (token, senha, API key, credencial) → `hasLearning: false`, `fact: ""` (nada do segredo em `fact`).
- Mensagem mista → no máximo um fato durável em `fact`, sem o pedido/segredo.
- Sem aprendizado claro → `hasLearning: false`.

## shouldRemember (puro)

```ts
function shouldRemember(decision: LearningDecision): string | null;
```

- `hasLearning === false` → `null`
- `fact` só espaços → `null`
- senão → `fact.trim()`

## scheduleLearning

```ts
function scheduleLearning(args: {
  userId: string;
  userMessage: string;
  memoryStore: MemoryStore;
  extractor: LearningExtractor;
}): void;
```

Comportamento:

1. Dispara trabalho assíncrono **sem** retornar Promise ao caller (fire-and-forget).
2. `decision = await extractor.extract(userMessage)`.
3. `fact = shouldRemember(decision)`; se `null`, para.
4. `await memoryStore.remember(userId, fact)` (dedup 008 aplica-se).
5. Erros: log `[learning-reflector]` em `console.error`; **não** propagam ao `/chat`.

## Integração em runChat

| Condição | Ação |
|----------|------|
| `userId` ausente | Não chama extractor nem schedule |
| Mensagem em branco (early return) | Não agenda |
| Estratégia falhou / timeout | Não agenda (só caminho que retorna sucesso de turno) |
| Sucesso com `userId` | Após append conversa, `scheduleLearning(...)`; depois `return` **sem await** do job |

O extrator default (`createLlmLearningExtractor`) pode ser injetado; ausência de injeção em produção usa o default LLM.

## Fora deste contrato

- Alterar body/resposta HTTP
- DDL / nova tabela
- Arena / bench
- Retry / fila persistente de aprendizado
