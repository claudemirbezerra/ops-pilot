import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  InvalidMemoryInputError,
  MemoryNotFoundError,
} from "../domain/errors.js";
import type {
  Embedder,
  MemoryRecord,
  MemoryStore,
  RecalledMemory,
} from "../domain/types.js";
import { getDefaultEmbedder } from "./embeddings.js";
import { dot, rankRecall, shouldDedup } from "./similarity.js";

type MemoryRow = {
  id: string;
  user_id: string;
  fact: string;
  embedding: Buffer;
  created_at: number;
};

function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidMemoryInputError(
      `Memória inválida: ${label} ausente.`,
    );
  }
  return value;
}

function embeddingToBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

function bufferToEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}

function toRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    fact: row.fact,
    createdAt: row.created_at,
  };
}

/**
 * Memórias semânticas no mesmo arquivo do guarda operacional (`OPSPILOT_DB`).
 * Prepared statements; testes usam `:memory:`.
 */
export class SqliteMemoryStore implements MemoryStore {
  /** @internal usado só por testes */
  readonly database: DatabaseSync;

  private readonly embedder: Embedder;
  private readonly insertMemory;
  private readonly selectByUser;
  private readonly deleteByUserAndId;

  constructor(
    path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db",
    embedder?: Embedder,
  ) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.embedder = embedder ?? getDefaultEmbedder();
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        fact TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories (user_id);
    `);

    this.insertMemory = this.database.prepare(
      `INSERT INTO memories (id, user_id, fact, embedding, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.selectByUser = this.database.prepare(
      `SELECT id, user_id, fact, embedding, created_at
       FROM memories WHERE user_id = ?`,
    );
    this.deleteByUserAndId = this.database.prepare(
      `DELETE FROM memories WHERE id = ? AND user_id = ?`,
    );
  }

  async remember(userId: string, fact: string): Promise<MemoryRecord> {
    requireNonBlank(userId, "userId");
    requireNonBlank(fact, "fact");

    const vector = await this.embedder.embed(fact);
    const rows = this.selectByUser.all(userId) as MemoryRow[];

    let best: { row: MemoryRow; score: number } | undefined;
    for (const row of rows) {
      const score = dot(vector, bufferToEmbedding(row.embedding));
      if (!shouldDedup(score)) {
        continue;
      }
      if (
        !best ||
        score > best.score ||
        (score === best.score &&
          (row.created_at < best.row.created_at ||
            (row.created_at === best.row.created_at &&
              row.id < best.row.id)))
      ) {
        best = { row, score };
      }
    }
    if (best) {
      return toRecord(best.row);
    }

    const id = randomUUID();
    const createdAt = Date.now();
    this.insertMemory.run(
      id,
      userId,
      fact,
      embeddingToBuffer(vector),
      createdAt,
    );
    return { id, userId, fact, createdAt };
  }

  async recall(userId: string, query: string): Promise<RecalledMemory[]> {
    requireNonBlank(userId, "userId");
    requireNonBlank(query, "query");

    const q = await this.embedder.embed(query);
    const rows = this.selectByUser.all(userId) as MemoryRow[];
    const scored = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      score: dot(q, bufferToEmbedding(row.embedding)),
      row,
    }));
    const ranked = rankRecall(scored);
    return ranked.map((item) => {
      const row = scored.find((s) => s.id === item.id)!.row;
      return { ...toRecord(row), score: item.score };
    });
  }

  forget(userId: string, memoryId: string): void {
    requireNonBlank(userId, "userId");
    requireNonBlank(memoryId, "memoryId");
    const result = this.deleteByUserAndId.run(memoryId, userId) as {
      changes: number;
    };
    if (result.changes === 0) {
      throw new MemoryNotFoundError(
        `Memória desconhecida: ${memoryId}.`,
      );
    }
  }
}
