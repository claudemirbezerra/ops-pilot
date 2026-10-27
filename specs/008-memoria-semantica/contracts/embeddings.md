# Contract: Embeddings locais

Módulo: `src/memory/embeddings.ts`. Consumidor: [memory-store.md](./memory-store.md).

## API

```ts
type Embedder = {
  embed(text: string): Promise<Float32Array>;
};

/** Lazy singleton do pipeline real. */
function getDefaultEmbedder(): Embedder;

/** Exportado para testes / injeção no store. */
function createTransformersEmbedder(modelId?: string): Embedder;
```

## Comportamento

| Item | Valor |
|------|--------|
| Pacote | `@huggingface/transformers` |
| Task | `feature-extraction` |
| Modelo default | `Xenova/all-MiniLM-L6-v2` |
| Opções de chamada | `{ pooling: "mean", normalize: true }` |
| Saída | `Float32Array` length **384**, L2-normalizado |
| Carga | na **primeira** chamada a `embed`; reuso do mesmo pipeline depois |

## Falhas

Qualquer erro de download, load ou inferência → lançar `EmbeddingUnavailableError` (domínio), sem vazar stack do pipeline para o HTTP.

## Testes

- Store e ranking: injetar `Embedder` fake (vetores unitários fabricados).
- Um ensaio de integração (SC-003) pode usar `getDefaultEmbedder()` / modelo real; timeout generoso; cache local do Hugging Face permitido.
