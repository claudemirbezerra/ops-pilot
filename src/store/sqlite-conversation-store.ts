import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ConversationNotFoundError,
  InvalidConversationMessageError,
} from "../domain/errors.js";
import type {
  ConversationMessage,
  ConversationRole,
  ConversationStore,
} from "../domain/types.js";

type MessageRow = {
  role: string;
  content: string;
};

const ROLES = new Set<ConversationRole>(["user", "assistant"]);

/**
 * Conversas no mesmo arquivo do guarda operacional (`OPSPILOT_DB`).
 * Prepared statements; testes usam `:memory:`.
 */
export class SqliteConversationStore implements ConversationStore {
  /** @internal usado só por testes de CHECK */
  readonly database: DatabaseSync;

  private readonly insertConversation;
  private readonly selectConversation;
  private readonly insertMessage;
  private readonly selectLastMessages;

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS messages_conversation_id_id
        ON messages (conversation_id, id);
    `);

    this.insertConversation = this.database.prepare(
      `INSERT INTO conversations (id, created_at) VALUES (?, ?)`,
    );
    this.selectConversation = this.database.prepare(
      `SELECT id FROM conversations WHERE id = ?`,
    );
    this.insertMessage = this.database.prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
    );
    this.selectLastMessages = this.database.prepare(
      `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`,
    );
  }

  create(): string {
    const id = randomUUID();
    this.insertConversation.run(id, Date.now());
    return id;
  }

  append(conversationId: string, message: ConversationMessage): void {
    this.requireConversation(conversationId);
    if (!ROLES.has(message.role) || message.content.trim().length === 0) {
      throw new InvalidConversationMessageError(
        "Mensagem inválida: falante ou texto ausente.",
      );
    }
    this.insertMessage.run(
      conversationId,
      message.role,
      message.content,
      Date.now(),
    );
  }

  lastMessages(conversationId: string, limit: number): ConversationMessage[] {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new InvalidConversationMessageError(
        "Mensagem inválida: o limite deve ser um inteiro maior ou igual a 1.",
      );
    }
    this.requireConversation(conversationId);
    const rows = this.selectLastMessages.all(conversationId, limit) as MessageRow[];
    return rows.reverse().map((row) => ({
      role: row.role as ConversationRole,
      content: row.content,
    }));
  }

  private requireConversation(conversationId: string): void {
    const row = this.selectConversation.get(conversationId);
    if (!row) {
      throw new ConversationNotFoundError(
        `Conversa desconhecida: ${conversationId}.`,
      );
    }
  }
}
