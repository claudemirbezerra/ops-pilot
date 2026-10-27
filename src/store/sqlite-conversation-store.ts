/**
 * Guarda de conversa. O construtor aceita o mesmo caminho do store operacional;
 * a persistência entra na tarefa do schema.
 */
export class SqliteConversationStore {
  constructor(
    readonly path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db",
  ) {}

  create(): string {
    throw new Error("not implemented");
  }

  append(
    _conversationId: string,
    _message: { role: string; content: string },
  ): void {
    throw new Error("not implemented");
  }

  lastMessages(_conversationId: string, _limit: number): [] {
    throw new Error("not implemented");
  }
}
