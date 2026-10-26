import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { DomainError } from "../domain/errors.js";
import type { OpsStore, Severity } from "../domain/types.js";
import { createDefaultOpsStore } from "./store.js";

function asObservation(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Erro desconhecido na ferramenta.";
}

export function createOpsTools(store: OpsStore = createDefaultOpsStore()) {
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
      description:
        "Lista alertas de monitoramento por status. Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou o inventário de alertas. Não use para incidentes formais (use list_incidents) nem para procedimentos (use consultar_runbook).",
      schema: z.object({
        status: z
          .enum(["firing", "resolved", "all"])
          .default("firing")
          .describe(
            'Filtro: "firing" (ativos), "resolved" (encerrados), "all" (todos). Default firing.',
          ),
      }),
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
      description:
        "Abre um incidente formal para um serviço do catálogo. Use após identificar um problema que exige registro (ex. alerta crítico em investigação). Não use só para consultar alertas; se o incidente já existe, use list_incidents ou resolver_incident.",
      schema: z.object({
        title: z.string().min(1).describe("Título curto do incidente"),
        service: z
          .string()
          .min(1)
          .describe("Slug do serviço afetado (ex.: payments, checkout, auth)"),
        severity: z
          .enum(["low", "medium", "high", "critical"])
          .describe("Severidade: low | medium | high | critical"),
      }),
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
      description:
        "Resolve um incidente pelo id numérico. Use quando a mitigação terminou e o incidente deve fechar. Não use para criar incidente novo nem para listar estado.",
      schema: z.object({
        id: z.number().int().positive().describe("ID numérico do incidente"),
        summary: z
          .string()
          .min(1)
          .optional()
          .describe("Resumo opcional da resolução (o que foi feito)"),
      }),
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

  return {
    store,
    tools: [
      list_alertas,
      open_incident,
      resolver_incident,
      list_incidents,
      consultar_runbook,
    ],
  };
}

/** Prefer `createOpsTools(store)` — evita abrir SQLite no import. */
export function getDefaultOpsTools() {
  return createOpsTools().tools;
}
