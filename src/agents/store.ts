import type { OpsStore } from "../domain/types.js";
import { InMemoryOpsStore } from "../store/in-memory-ops-store.js";
import { seedOpsStore } from "../store/seed-mercadinho.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";

export type {
  AlertRecord,
  AlertStatus,
  IncidentRecord,
  IncidentStatus,
  OpsStore,
  RunbookRecord,
  SeedPayload,
  ServiceRecord,
  ServiceTier,
  Severity,
} from "../domain/types.js";

/** Store de produção: SQLite em arquivo + seed Mercadinho. */
export function createDefaultOpsStore(
  path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db",
): OpsStore {
  const store = new SqliteOpsStore(path);
  seedOpsStore(store);
  return store;
}

/** Store in-memory seedado — bench, arena e testes reproduzíveis. */
export function createInMemorySeededStore(): InMemoryOpsStore {
  const store = new InMemoryOpsStore();
  seedOpsStore(store);
  return store;
}

export type CatalogCounts = {
  services: number;
  alerts: number;
  firing: number;
  resolved: number;
};

export function summarizeOpsStore(store: OpsStore): CatalogCounts {
  const alerts = store.listAlerts("all");
  const serviceSlugs = new Set(alerts.map((alert) => alert.serviceSlug));
  // Mercadinho seed: 5 services; alerts cover all slugs.
  return {
    services: serviceSlugs.size,
    alerts: alerts.length,
    firing: alerts.filter((alert) => alert.status === "firing").length,
    resolved: alerts.filter((alert) => alert.status === "resolved").length,
  };
}
