# Contract: ConversationSummarizer

Porta injetável para consolidar o lote de egressos. Usada só por `runChat` (não pela borda HTTP diretamente).

## Tipo

```ts
type SummarizeInput = {
  previousSummary: string; // "" na primeira consolidação
  egressBatch: ConversationMessage[]; // exatamente 8 mensagens, ordem cronológica
};

type ConversationSummarizer = {
  summarize(input: SummarizeInput): Promise<string>;
};
```

## Produção

`createLlmConversationSummarizer()`:

- Usa o modelo já configurado no projeto (OpenRouter / LangChain).
- System/user prompt instrui: mesclar `previousSummary` + `egressBatch`; preservar **decisões**, **fatos** e **pendências**; alvo **~150 tokens** (≈ 600 caracteres na heurística chars÷4).
- Devolve string (texto do novo resumo). Texto só com espaços trata-se como falha no orquestrador (sem upsert).

## Testes / fake

Injeção via `createApp({ conversationSummarizer })` / `RunChatInput`:

- Fake conta chamadas e devolve texto determinístico (ex.: `SUMMARY(prev=…;n=8)`).
- Assert: zero chamadas até o 8º egresso pendente; uma chamada no fechamento do lote; inputs com `egressBatch.length === 8`.

## Orquestração (`runChat`)

1. Só no 200 após append user+assistant.
2. Se `pending.length >= 8`: `await summarizer.summarize({ previousSummary, egressBatch })`.
3. Sucesso com texto não branco → `upsertSummary` + evento `summarize` no `trace`.
4. Erro ou texto branco → log `[history-summarizer]`; sem upsert; sem evento; 200 da estratégia intacto.

## Fora de escopo

- Sumarização em arena/bench.
- Endpoint HTTP dedicado ao sumarizador.
