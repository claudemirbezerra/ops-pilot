// Referencia para implementação do sqlite-ops-StorageEvent

import { DatabaseSync } from "node:sqlite";
import type { OpsStore, Incident, IncidentFilter } from "./ops-store.ts";

export class SqqliteOpsStore implements OpsStore {
    _db: DatabaseSync;
    constructor(path = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
        this._db = new DatabaseSync(path);
        this._db.exec(`
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL
                service_id TEXT NOT NULL,
                severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3')),
                status TEXT NOT NULL CHECK (status IN ('open', 'mitigated', 'resolved')),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                summary TEXT,
            );
        `
        // + services, alertas, runbooks e o seed idempotente da Mercadinho
        )
    }

    listIncidents(filter: IncidentFilter): Incident[] {
        const where = filter === "all" ? "" : `WHERE status = ?`;
        const stmt = this._db.prepare(`
            SELECT id, title, service_id, severity, status, created_at, updated_at, summary
            FROM incidents
            ${where}
            ORDER BY created_at DESC
        `);
        return (filter === "all" ? stmt.all() : stmt.all(filter)) as Incident[];
    }

    //listAlerts(), openIncidents(), resolveIncident(), getRunbook(): mesmo padrão -  preparade statement + retorno tipado
}