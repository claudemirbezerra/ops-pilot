import type { Embedder } from "./embeddings.js";

/**
 * Memórias semânticas no mesmo arquivo do guarda operacional (`OPSPILOT_DB`).
 * Prepared statements; testes usam `:memory:`.
 */
export class SqliteMemoryStore {
  constructor(
    _path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db",
    _embedder?: Embedder,
  ) {}

  remember(_userId: string, _fact: string): Promise<never> {
    throw new Error("not implemented");
  }

  recall(_userId: string, _query: string): Promise<never> {
    throw new Error("not implemented");
  }

  forget(_userId: string, _memoryId: string): void {
    throw new Error("not implemented");
  }
}
