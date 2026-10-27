# Contract: POST /chat (delta — refletor de aprendizado)

Delta sobre o contrato 008 `chat-http.md`. Body e envelope de resposta **não mudam**.

## Request / Response

Inalterados:

- Body: `message`, `strategy?`, `reflect?`, `conversationId?`, `userId?`
- 200: `answer`, `trace`, `metrics`, `conversationId?`
- 400 / 404 / 422 / 503 / 504: iguais

O aprendizado **não** aparece no JSON de resposta.

## Efeitos colaterais novos

| Condição | Efeito |
|----------|--------|
| `userId` presente + turno 200 de sucesso | Após montar o resultado, agenda `scheduleLearning` (extractor → *remember* opcional). Cliente já pode receber o 200 enquanto o job corre. |
| `userId` ausente | Sem aprendizado automático (igual 008 para gravação). |
| Falha no job async | Não altera status/body já enviáveis; log servidor. |
| Tool `forget_preference` no raciocínio | Visível no `trace` como action/observation se a estratégia a chamar; requer `userId` no pedido para sucesso. |

## createApp

```ts
type CreateAppOptions = {
  // ... existentes (registry, critic, timeoutMs, conversationStore, memoryStore)
  learningExtractor?: LearningExtractor;
};
```

Default: extrator LLM. Testes injetam stub.

## Regressões obrigatórias

- Sem `userId`: prompt e resposta como 007/008; zero chamadas ao extractor.
- Com `userId`: recall pré-prompt (008) **e** aprendizado pós-resposta (009).
- `userId` inválido: 400; sem schedule.
