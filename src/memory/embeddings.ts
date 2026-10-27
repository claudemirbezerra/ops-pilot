import { pipeline } from "@huggingface/transformers";

import { EmbeddingUnavailableError } from "../domain/errors.js";
import type { Embedder } from "../domain/types.js";
import { EMBEDDING_DIMS } from "./similarity.js";

export type { Embedder };

type FeatureExtractor = (
  texts: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array | number[]; tolist?: () => number[][] }>;

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

let defaultEmbedder: Embedder | undefined;

function toFloat32(raw: Float32Array | number[]): Float32Array {
  if (raw instanceof Float32Array) {
    if (raw.length === EMBEDDING_DIMS) {
      return raw;
    }
    return raw.slice(0, EMBEDDING_DIMS);
  }
  return Float32Array.from(raw.slice(0, EMBEDDING_DIMS));
}

export function createTransformersEmbedder(
  modelId: string = DEFAULT_MODEL,
): Embedder {
  let extractorPromise: Promise<FeatureExtractor> | undefined;

  async function getExtractor(): Promise<FeatureExtractor> {
    if (!extractorPromise) {
      extractorPromise = pipeline("feature-extraction", modelId).then(
        (p) => p as unknown as FeatureExtractor,
      );
    }
    return extractorPromise;
  }

  return {
    async embed(text: string): Promise<Float32Array> {
      try {
        const extractor = await getExtractor();
        const output = await extractor(text, {
          pooling: "mean",
          normalize: true,
        });
        if (output && typeof output.tolist === "function") {
          const list = output.tolist();
          const first = Array.isArray(list[0]) ? list[0]! : list;
          return toFloat32(first as number[]);
        }
        return toFloat32(output.data);
      } catch (error: unknown) {
        const detail =
          error instanceof Error ? error.message : "erro desconhecido";
        throw new EmbeddingUnavailableError(
          `Embedding indisponível: ${detail}`,
        );
      }
    },
  };
}

export function getDefaultEmbedder(): Embedder {
  if (!defaultEmbedder) {
    defaultEmbedder = createTransformersEmbedder();
  }
  return defaultEmbedder;
}
