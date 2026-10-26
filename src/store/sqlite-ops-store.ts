import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  InvalidAlertStatusError,
  InvalidIncidentInputError,
  RunbookNotFoundError,
  UnknownIncidentError,
  UnknownServiceError,
} from "../domain/errors.js";
import type {
  AlertRecord,
  AlertStatus,
  IncidentRecord,
  IncidentStatus,
  OpsStore,
  RunbookRecord,
  SeedPayload,
  Severity,
} from "../domain/types.js";

type AlertRow = {
  service_slug: string;
  title: string;
  detail: string;
  severity: Severity;
  status: AlertStatus;
};

type IncidentRow = {
  id: number;
  title: string;
  service_slug: string;
  severity: Severity;
  status: IncidentStatus;
  created_at: number;
  resolved_at: number | null;
  summary: string | null;
};

type RunbookRow = {
  service: string;
  content: string;
};

/**
 * Persistência operacional SQLite (`node:sqlite` / DatabaseSync).
 * Padrão: prepared statements; path via OPSPILOT_DB (default ./data/opspilot.db).
 */
export class SqliteOpsStore implements OpsStore {
  /** @internal usado só por testes de CHECK */
  readonly database: DatabaseSync;

  private readonly insertService;
  private readonly insertAlert;
  private readonly insertRunbook;
  private readonly selectAlertsAll;
  private readonly selectAlertsByStatus;
  private readonly selectIncidentsAll;
  private readonly selectIncidentsByStatus;
  private readonly selectService;
  private readonly insertIncident;
  private readonly selectIncidentById;
  private readonly updateIncidentResolved;
  private readonly selectRunbook;

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.database = new DatabaseSync(path);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS services (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('critical', 'high', 'standard'))
      );

      CREATE TABLE IF NOT EXISTS alerts (
        service_slug TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        status TEXT NOT NULL CHECK (status IN ('firing', 'resolved')),
        PRIMARY KEY (service_slug, title)
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        service_slug TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS runbooks (
        service TEXT PRIMARY KEY,
        content TEXT NOT NULL
      );
    `);

    this.insertService = this.database.prepare(
      `INSERT OR IGNORE INTO services (slug, name, description, tier) VALUES (?, ?, ?, ?)`,
    );
    this.insertAlert = this.database.prepare(
      `INSERT OR IGNORE INTO alerts (service_slug, title, detail, severity, status) VALUES (?, ?, ?, ?, ?)`,
    );
    this.insertRunbook = this.database.prepare(
      `INSERT OR IGNORE INTO runbooks (service, content) VALUES (?, ?)`,
    );
    this.selectAlertsAll = this.database.prepare(
      `SELECT service_slug, title, detail, severity, status FROM alerts`,
    );
    this.selectAlertsByStatus = this.database.prepare(
      `SELECT service_slug, title, detail, severity, status FROM alerts WHERE status = ?`,
    );
    this.selectIncidentsAll = this.database.prepare(
      `SELECT id, title, service_slug, severity, status, created_at, resolved_at, summary FROM incidents ORDER BY id ASC`,
    );
    this.selectIncidentsByStatus = this.database.prepare(
      `SELECT id, title, service_slug, severity, status, created_at, resolved_at, summary FROM incidents WHERE status = ? ORDER BY id ASC`,
    );
    this.selectService = this.database.prepare(
      `SELECT slug FROM services WHERE slug = ?`,
    );
    this.insertIncident = this.database.prepare(
      `INSERT INTO incidents (title, service_slug, severity, status, created_at, resolved_at, summary)
       VALUES (?, ?, ?, 'open', ?, NULL, NULL)`,
    );
    this.selectIncidentById = this.database.prepare(
      `SELECT id, title, service_slug, severity, status, created_at, resolved_at, summary FROM incidents WHERE id = ?`,
    );
    this.updateIncidentResolved = this.database.prepare(
      `UPDATE incidents SET status = 'resolved', resolved_at = ?, summary = ? WHERE id = ?`,
    );
    this.selectRunbook = this.database.prepare(
      `SELECT service, content FROM runbooks WHERE service = ?`,
    );
  }

  seed(data: SeedPayload): void {
    for (const service of data.services) {
      this.insertService.run(
        service.slug,
        service.name,
        service.description,
        service.tier,
      );
    }
    for (const alert of data.alerts) {
      this.insertAlert.run(
        alert.serviceSlug,
        alert.title,
        alert.detail,
        alert.severity,
        alert.status,
      );
    }
    for (const runbook of data.runbooks) {
      this.insertRunbook.run(runbook.service, runbook.content);
    }
  }

  listAlerts(status: AlertStatus | "all"): AlertRecord[] {
    if (status !== "all" && status !== "firing" && status !== "resolved") {
      throw new InvalidAlertStatusError(
        `Situação de alerta inválida: ${status}. Use firing, resolved ou all.`,
      );
    }

    const rows =
      status === "all"
        ? (this.selectAlertsAll.all() as AlertRow[])
        : (this.selectAlertsByStatus.all(status) as AlertRow[]);

    return rows.map(mapAlert);
  }

  listIncidents(status: IncidentStatus | "all"): IncidentRecord[] {
    const rows =
      status === "all"
        ? (this.selectIncidentsAll.all() as IncidentRow[])
        : (this.selectIncidentsByStatus.all(status) as IncidentRow[]);

    return rows.map(mapIncident);
  }

  openIncident(input: {
    title: string;
    service: string;
    severity: Severity;
  }): IncidentRecord {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new InvalidIncidentInputError("O título do incidente é obrigatório.");
    }

    const service = this.selectService.get(input.service);
    if (!service) {
      throw new UnknownServiceError(`Serviço desconhecido: ${input.service}.`);
    }

    const createdAt = Date.now();
    const result = this.insertIncident.run(
      title,
      input.service,
      input.severity,
      createdAt,
    );
    const id = Number(result.lastInsertRowid);
    const row = this.selectIncidentById.get(id) as IncidentRow | undefined;
    if (!row) {
      throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
    }
    return mapIncident(row);
  }

  resolveIncident(id: number, summary?: string | null): IncidentRecord {
    if (!Number.isInteger(id) || id < 1) {
      throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
    }

    const current = this.selectIncidentById.get(id) as IncidentRow | undefined;
    if (!current) {
      throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
    }

    if (current.status === "resolved") {
      return mapIncident(current);
    }

    const resolvedAt = Date.now();
    this.updateIncidentResolved.run(resolvedAt, summary ?? null, id);
    const updated = this.selectIncidentById.get(id) as IncidentRow;
    return mapIncident(updated);
  }

  getRunbook(service: string): RunbookRecord {
    const row = this.selectRunbook.get(service) as RunbookRow | undefined;
    if (!row) {
      throw new RunbookNotFoundError(`Runbook não encontrado: ${service}.`);
    }
    return { service: row.service, content: row.content };
  }
}

function mapAlert(row: AlertRow): AlertRecord {
  return {
    serviceSlug: row.service_slug,
    title: row.title,
    detail: row.detail,
    severity: row.severity,
    status: row.status,
  };
}

function mapIncident(row: IncidentRow): IncidentRecord {
  return {
    id: row.id,
    title: row.title,
    serviceSlug: row.service_slug,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    summary: row.summary,
  };
}
