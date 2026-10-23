import { z } from "zod";

import { InvalidCatalogError } from "../domain/errors.js";

const serviceSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
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

const primaryCatalogInput = {
  services: [
    {
      slug: "api-gateway",
      name: "API Gateway",
      description: "Entrada HTTP do produto.",
    },
    {
      slug: "checkout",
      name: "Checkout",
      description: "Fechamento de pedido.",
    },
    {
      slug: "payments",
      name: "Pagamentos",
      description: "Autorização e captura.",
    },
    {
      slug: "auth",
      name: "Autenticação",
      description: "Login e sessão.",
    },
    {
      slug: "notifications",
      name: "Notificações",
      description: "E-mail e push.",
    },
  ],
  alerts: [
    {
      serviceSlug: "checkout",
      title: "Taxa de erro 5xx no checkout",
      detail: "Mais de 8% das finalizações retornam 5xx nos últimos 5 minutos.",
      status: "firing",
      severity: "critical",
    },
    {
      serviceSlug: "payments",
      title: "Latência p99 de autorização",
      detail: "A autorização de cartão está acima de 2 segundos.",
      status: "firing",
      severity: "high",
    },
    {
      serviceSlug: "auth",
      title: "Pico de falhas de login",
      detail: "Aumento súbito de respostas 401 no fluxo de senha.",
      status: "firing",
      severity: "medium",
    },
    {
      serviceSlug: "api-gateway",
      title: "Certificado renovado",
      detail: "O certificado da borda foi renovado antes do vencimento.",
      status: "resolved",
      severity: "low",
    },
    {
      serviceSlug: "notifications",
      title: "Fila de e-mail normalizada",
      detail: "O atraso da fila de envio voltou ao patamar habitual.",
      status: "resolved",
      severity: "high",
    },
    {
      serviceSlug: "checkout",
      title: "Checkout indisponível recuperado",
      detail: "A queda total do checkout foi revertida após o rollback.",
      status: "resolved",
      severity: "critical",
    },
  ],
} as const;

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

export const primaryCatalog = parsePrimaryCatalog(primaryCatalogInput);

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
