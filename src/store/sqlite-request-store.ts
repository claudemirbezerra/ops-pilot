import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  PersistedTraceEvent,
  RequestStore,
  SavedRequest,
} from "../domain/types.js";

type RequestRow = {
  id: string;
  created_at: number | bigint;
  metrics_json: string;
};

type TraceEventRow = {
  seq: number | bigint;
  payload: string;
};

/**
 * Persistência de execução de `/chat` (`requests` + `trace_events`).
 * Path via OPSPILOT_DB (default ./data/opspilot.db); testes usam `:memory:`.
 */
export class SqliteRequestStore implements RequestStore {
  /** @internal usado só por testes */
  readonly database: DatabaseSync;

  private readonly insertRequest;
  private readonly selectRequest;
  private readonly insertTraceEvent;
  private readonly selectTraceEvents;

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        metrics_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trace_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL REFERENCES requests(id),
        seq INTEGER NOT NULL,
        node TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        UNIQUE (request_id, seq)
      );

      CREATE INDEX IF NOT EXISTS trace_events_request_id_seq
        ON trace_events (request_id, seq);
    `);

    this.insertRequest = this.database.prepare(
      `INSERT INTO requests (id, created_at, metrics_json) VALUES (?, ?, ?)`,
    );
    this.selectRequest = this.database.prepare(
      `SELECT id, created_at, metrics_json FROM requests WHERE id = ?`,
    );
    this.insertTraceEvent = this.database.prepare(
      `INSERT INTO trace_events (request_id, seq, node, type, payload)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.selectTraceEvents = this.database.prepare(
      `SELECT seq, payload FROM trace_events
       WHERE request_id = ?
       ORDER BY seq ASC`,
    );
  }

  save(input: {
    id: string;
    createdAt: number;
    metrics: SavedRequest["metrics"];
    trace: PersistedTraceEvent[];
  }): void {
    const metricsJson = JSON.stringify(input.metrics);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.insertRequest.run(input.id, input.createdAt, metricsJson);
      input.trace.forEach((event, seq) => {
        const node = typeof event.node === "string" ? event.node : null;
        this.insertTraceEvent.run(
          input.id,
          seq,
          node,
          String(event.type),
          JSON.stringify(event),
        );
      });
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getById(id: string): SavedRequest | null {
    const row = this.selectRequest.get(id) as RequestRow | undefined;
    if (!row) {
      return null;
    }
    const eventRows = this.selectTraceEvents.all(id) as TraceEventRow[];
    const trace = eventRows.map((eventRow) => {
      return JSON.parse(eventRow.payload) as PersistedTraceEvent;
    });
    return {
      requestId: row.id,
      createdAt: Number(row.created_at),
      metrics: JSON.parse(row.metrics_json) as Record<string, unknown>,
      trace,
    };
  }
}
