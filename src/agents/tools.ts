import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  DomainError,
  UserIdRequiredError,
} from "../domain/errors.js";
import type { MemoryStore, OpsStore, Severity } from "../domain/types.js";
import {
  LIST_ALERTS_DESCRIPTION,
  OPEN_INCIDENT_DESCRIPTION,
  RESOLVE_INCIDENT_DESCRIPTION,
  listAlertsInputSchema,
  openIncidentInputSchema,
  resolveIncidentInputSchema,
} from "./ops-tool-schemas.js";
import {
  fetchProviderStatus,
  type FetchImpl,
  type ProviderId,
} from "./provider-status.js";
import { createDefaultOpsStore } from "./store.js";

export type CreateOpsToolsDeps = {
  fetchImpl?: FetchImpl;
  memoryStore?: MemoryStore;
  userId?: string;
};

export function asObservation(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Erro desconhecido na ferramenta.";
}

export function createOpsTools(
  store: OpsStore = createDefaultOpsStore(),
  deps: CreateOpsToolsDeps = {},
) {
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const list_alertas = tool(
    async ({ status }) => {
      try {
        return JSON.stringify(store.listAlerts(status));
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "list_alertas",
      description: LIST_ALERTS_DESCRIPTION,
      schema: listAlertsInputSchema,
    },
  );

  const open_incident = tool(
    async ({ title, service, severity }) => {
      try {
        const incident = store.openIncident({
          title,
          service,
          severity: severity as Severity,
        });
        return JSON.stringify(incident);
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "open_incident",
      description: OPEN_INCIDENT_DESCRIPTION,
      schema: openIncidentInputSchema,
    },
  );

  const resolver_incident = tool(
    async ({ id, summary }) => {
      try {
        const incident = store.resolveIncident(id, summary);
        return JSON.stringify(incident);
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "resolver_incident",
      description: RESOLVE_INCIDENT_DESCRIPTION,
      schema: resolveIncidentInputSchema,
    },
  );

  const list_incidents = tool(
    async ({ status }) => {
      try {
        return JSON.stringify(store.listIncidents(status));
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "list_incidents",
      description:
        "Lista incidentes por status. Use para ver abertos, resolvidos ou todos durante o plantão. Não use para alertas crus (list_alertas) nem para texto de runbook.",
      schema: z.object({
        status: z
          .enum(["open", "resolved", "all"])
          .default("open")
          .describe('Filtro: "open" (default), "resolved", ou "all".'),
      }),
    },
  );

  const consultar_runbook = tool(
    async ({ service }) => {
      try {
        const runbook = store.getRunbook(service);
        return runbook.content;
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "consultar_runbook",
      description:
        "Consulta o runbook operacional de um serviço (checkout, payments, auth). Use quando precisar dos passos do procedimento. Não invente procedimento se não houver runbook; não substitui abrir/resolver incidente.",
      schema: z.object({
        service: z
          .string()
          .min(1)
          .describe("Slug do serviço cujo runbook será consultado"),
      }),
    },
  );

  const check_provider_status = tool(
    async ({ provider }) => {
      try {
        return await fetchProviderStatus(provider as ProviderId, doFetch);
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "check_provider_status",
      description:
        "Consulta a status page pública de um provedor externo (GitHub ou Cloudflare), sem API key. Use quando houver suspeita de problema externo, dúvida \"é o nosso ou do provedor?\", ou dependência fora do ar. Não use para alertas/incidentes internos do Mercadinho (list_alertas / list_incidents) nem para runbook.",
      schema: z.object({
        provider: z
          .enum(["github", "cloudflare"])
          .default("github")
          .describe(
            'Provedor cuja status page pública será consultada: "github" (default) ou "cloudflare".',
          ),
      }),
    },
  );

  const forget_preference = tool(
    async ({ description }) => {
      try {
        const userId = deps.userId?.trim() ?? "";
        const memoryStore = deps.memoryStore;
        if (!userId || memoryStore === undefined) {
          return asObservation(new UserIdRequiredError());
        }

        const candidates = await memoryStore.recall(userId, description);
        if (candidates.length === 0) {
          return JSON.stringify({ forgotten: false });
        }

        const top = candidates[0]!;
        memoryStore.forget(userId, top.id);
        return JSON.stringify({
          forgotten: true,
          id: top.id,
          fact: top.fact,
        });
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "forget_preference",
      description:
        "Esquece uma preferência ou fato durável da memória do plantonista atual, a partir de uma descrição em texto. Use quando o plantonista pedir para esquecer ou corrigir uma preferência aprendida. Não use para apagar alertas/incidentes.",
      schema: z.object({
        description: z
          .string()
          .trim()
          .min(1)
          .describe("Descrição da preferência ou fato a esquecer"),
      }),
    },
  );

  return {
    store,
    tools: [
      list_alertas,
      open_incident,
      resolver_incident,
      list_incidents,
      consultar_runbook,
      check_provider_status,
      forget_preference,
    ],
  };
}

/** Prefer `createOpsTools(store)` — evita abrir SQLite no import. */
export function getDefaultOpsTools() {
  return createOpsTools().tools;
}
