export type Embedder = {
  embed(text: string): Promise<Float32Array>;
};

export function createTransformersEmbedder(_modelId?: string): Embedder {
  throw new Error("not implemented");
}

export function getDefaultEmbedder(): Embedder {
  throw new Error("not implemented");
}
