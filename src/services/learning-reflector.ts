import type {
  LearningDecision,
  LearningExtractor,
} from "../agents/learning-extractor.js";
import type { MemoryStore } from "../domain/types.js";

export function shouldRemember(decision: LearningDecision): string | null {
  if (!decision.hasLearning) {
    return null;
  }
  const fact = decision.fact.trim();
  return fact.length === 0 ? null : fact;
}

export type ScheduleLearningArgs = {
  userId: string;
  userMessage: string;
  memoryStore: MemoryStore;
  extractor: LearningExtractor;
};

export function scheduleLearning(args: ScheduleLearningArgs): void {
  void (async () => {
    const decision = await args.extractor.extract(args.userMessage);
    const fact = shouldRemember(decision);
    if (fact === null) {
      return;
    }
    await args.memoryStore.remember(args.userId, fact);
  })().catch((error: unknown) => {
    console.error("[learning-reflector]", error);
  });
}
