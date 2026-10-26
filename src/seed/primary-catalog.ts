import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { InvalidCatalogError } from "../domain/errors.js";

const serviceSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    tier: z.enum(["critical", "high", "standard"]),
  })
  .strict();

const alertSchema = z
  .object({
    serviceSlug: z.string().trim().min(1),
    title: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    status: z.enum(["firing", "resolved"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
  })
  .strict();

const catalogSchema = z
  .object({
    services: z.array(serviceSchema).length(5),
    alerts: z.array(alertSchema).length(6),
  })
  .strict();

export type PrimaryCatalog = z.infer<typeof catalogSchema>;

export type CatalogSummary = {
  services: number;
  alerts: number;
  firing: number;
  resolved: number;
};

export function parsePrimaryCatalog(input: unknown): PrimaryCatalog {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidCatalogError(formatIssues(parsed.error.issues));
  }

  assertCatalogRules(parsed.data);
  return parsed.data;
}

export function summarizeCatalog(catalog: PrimaryCatalog): CatalogSummary {
  return {
    services: catalog.services.length,
    alerts: catalog.alerts.length,
    firing: catalog.alerts.filter((alert) => alert.status === "firing").length,
    resolved: catalog.alerts.filter((alert) => alert.status === "resolved").length,
  };
}

function loadPrimaryCatalogFromJson(): PrimaryCatalog {
  const path = join(dirname(fileURLToPath(import.meta.url)), "primary-catalog.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    services?: unknown;
    alerts?: unknown;
  };
  return parsePrimaryCatalog({
    services: raw.services,
    alerts: raw.alerts,
  });
}

export const primaryCatalog = loadPrimaryCatalogFromJson();

function assertCatalogRules(catalog: PrimaryCatalog): void {
  const slugs = catalog.services.map((service) => service.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new InvalidCatalogError("Os serviços do catálogo precisam de slugs únicos.");
  }

  const known = new Set(slugs);
  const unknown = catalog.alerts.find((alert) => !known.has(alert.serviceSlug));
  if (unknown) {
    throw new InvalidCatalogError(
      `O alerta "${unknown.title}" aponta para um serviço desconhecido.`,
    );
  }

  const summary = summarizeCatalog(catalog);
  if (summary.firing !== 3 || summary.resolved !== 3) {
    throw new InvalidCatalogError(
      "O catálogo precisa ter 3 alertas em disparo e 3 resolvidos.",
    );
  }

  const severities = new Set(catalog.alerts.map((alert) => alert.severity));
  if (severities.size < 3) {
    throw new InvalidCatalogError("Os alertas precisam variar de severidade.");
  }
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "catálogo";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
