export const DEDUP_THRESHOLD = 0.92;
export const RECALL_MIN_SCORE = 0.3;
export const RECALL_TOP_K = 3;
export const EMBEDDING_DIMS = 384;

export function dot(_a: Float32Array, _b: Float32Array): number {
  throw new Error("not implemented");
}

export function shouldDedup(_score: number): boolean {
  throw new Error("not implemented");
}

export type RankRecallCandidate = {
  id: string;
  createdAt: number;
  score: number;
};

export function rankRecall(
  _candidates: RankRecallCandidate[],
): RankRecallCandidate[] {
  throw new Error("not implemented");
}
