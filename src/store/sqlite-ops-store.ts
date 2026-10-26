import { DatabaseSync } from "node:sqlite";

/**
 * Persistência operacional SQLite (`node:sqlite` / DatabaseSync).
 * Schema + métodos completos nas tasks US1.
 */
export class SqliteOpsStore {
  /** @internal usado só por testes de CHECK */
  readonly database: DatabaseSync;

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    this.database = new DatabaseSync(path);
  }
}
