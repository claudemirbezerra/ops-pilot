export const DEDUP_THRESHOLD = 0.92;
export const RECALL_MIN_SCORE = 0.3;
export const RECALL_TOP_K = 3;
export const EMBEDDING_DIMS = 384;

export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

export function shouldDedup(score: number): boolean {
  return score > DEDUP_THRESHOLD;
}

export type RankRecallCandidate = {
  id: string;
  createdAt: number;
  score: number;
};

export function rankRecall(
  candidates: RankRecallCandidate[],
): RankRecallCandidate[] {
  return candidates
    .filter((c) => c.score >= RECALL_MIN_SCORE)
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, RECALL_TOP_K);
}
