import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { InvalidCatalogError } from "../domain/errors.js";
import type { OpsStore, SeedPayload } from "../domain/types.js";

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

const runbookSchema = z
  .object({
    service: z.string().trim().min(1),
    content: z.string().trim().min(1),
  })
  .strict();

const seedSchema = z
  .object({
    services: z.array(serviceSchema).length(5),
    alerts: z.array(alertSchema).length(6),
    runbooks: z.array(runbookSchema).length(3),
  })
  .strict();

export type MercadinhoSeed = z.infer<typeof seedSchema>;

export function parseMercadinhoSeed(input: unknown): SeedPayload {
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidCatalogError(formatIssues(parsed.error.issues));
  }

  assertSeedRules(parsed.data);
  return {
    services: parsed.data.services.map((service) => ({ ...service })),
    alerts: parsed.data.alerts.map((alert) => ({ ...alert })),
    runbooks: parsed.data.runbooks.map((runbook) => ({ ...runbook })),
  };
}

export function loadMercadinhoSeed(): SeedPayload {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "seed",
    "primary-catalog.json",
  );
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseMercadinhoSeed(raw);
}

export function seedOpsStore(store: OpsStore, data: SeedPayload = loadMercadinhoSeed()): void {
  store.seed(data);
}

function assertSeedRules(data: MercadinhoSeed): void {
  const slugs = data.services.map((service) => service.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new InvalidCatalogError("Os serviços do catálogo precisam de slugs únicos.");
  }

  const known = new Set(slugs);
  const unknownAlert = data.alerts.find((alert) => !known.has(alert.serviceSlug));
  if (unknownAlert) {
    throw new InvalidCatalogError(
      `O alerta "${unknownAlert.title}" aponta para um serviço desconhecido.`,
    );
  }

  const firing = data.alerts.filter((alert) => alert.status === "firing").length;
  const resolved = data.alerts.filter((alert) => alert.status === "resolved").length;
  if (firing !== 3 || resolved !== 3) {
    throw new InvalidCatalogError(
      "O catálogo precisa ter 3 alertas em disparo e 3 resolvidos.",
    );
  }

  const requiredRunbooks = ["checkout", "payments", "auth"];
  for (const service of requiredRunbooks) {
    if (!data.runbooks.some((runbook) => runbook.service === service)) {
      throw new InvalidCatalogError(`Falta runbook para o serviço ${service}.`);
    }
  }

  for (const runbook of data.runbooks) {
    if (!known.has(runbook.service)) {
      throw new InvalidCatalogError(
        `O runbook de "${runbook.service}" aponta para um serviço desconhecido.`,
      );
    }
  }
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "seed";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
