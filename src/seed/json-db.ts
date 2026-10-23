import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Store } from "../agents/store.js";
import { InvalidCatalogError } from "../domain/errors.js";
import { parsePrimaryCatalog, summarizeCatalog, type CatalogSummary } from "./primary-catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

/** Template versionado do catálogo primário. */
export const PRIMARY_CATALOG_JSON = join(here, "primary-catalog.json");

/** Base em arquivo usada pelas tools em runtime (testes locais sem MySQL). */
export const OPS_STORE_JSON = join(repoRoot, "data", "ops-store.json");

const storeFileSchema = {
  parse(raw: unknown): Store {
    if (!raw || typeof raw !== "object") {
      throw new InvalidCatalogError("JSON do store inválido.");
    }

    const value = raw as Record<string, unknown>;
    const catalog = parsePrimaryCatalog({
      services: value.services,
      alerts: value.alerts,
    });

    const incidents = Array.isArray(value.incidents) ? value.incidents : [];
    const nextIncidentId =
      typeof value.nextIncidentId === "number" && value.nextIncidentId >= 1
        ? value.nextIncidentId
        : 1;

    return {
      services: catalog.services.map((service) => ({ ...service })),
      alerts: catalog.alerts.map((alert) => ({ ...alert })),
      incidents: incidents.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: Number(row.id),
          title: String(row.title ?? ""),
          serviceSlug: String(row.serviceSlug ?? ""),
          severity: row.severity as Store["incidents"][number]["severity"],
          status: row.status as Store["incidents"][number]["status"],
        };
      }),
      nextIncidentId,
    };
  },
};

export function readPrimaryCatalogJson(): Store {
  const raw = JSON.parse(readFileSync(PRIMARY_CATALOG_JSON, "utf8")) as unknown;
  return storeFileSchema.parse(raw);
}

export function seedJsonStore(targetPath: string = OPS_STORE_JSON): CatalogSummary {
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(PRIMARY_CATALOG_JSON, targetPath);
  const store = loadJsonStore(targetPath);
  return summarizeCatalog({
    services: store.services,
    alerts: store.alerts,
  });
}

export function loadJsonStore(path: string = OPS_STORE_JSON): Store {
  if (!existsSync(path)) {
    seedJsonStore(path);
  }

  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return storeFileSchema.parse(raw);
}

export function saveJsonStore(store: Store, path: string = OPS_STORE_JSON): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        services: store.services,
        alerts: store.alerts,
        incidents: store.incidents,
        nextIncidentId: store.nextIncidentId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
