import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { DomainError } from "../domain/errors.js";
import {
  createStoreHolder,
  listAlerts,
  openIncident,
  resolveIncident,
  type Severity,
  type StoreHolder,
} from "./store.js";

const severitySchema = z.enum(["low", "medium", "high", "critical"]);

function asObservation(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Erro desconhecido na ferramenta.";
}

export function createOpsTools(holder: StoreHolder = createStoreHolder()) {
  const list_alertas = tool(
    async ({ status }) => {
      try {
        return JSON.stringify(listAlerts(holder.current, status));
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "list_alertas",
      description:
        "Lista os alertas de monitoramento. Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou como está o plantão. status: firing | resolved",
      schema: z.object({
        status: z.enum(["firing", "resolved"]),
      }),
    },
  );

  const open_incident = tool(
    async ({ title, service, severity }) => {
      try {
        const result = openIncident(holder.current, {
          title,
          service,
          severity: severity as Severity,
        });
        holder.current = result.store;
        return JSON.stringify(result.incident);
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "open_incident",
      description:
        "Abre um incidente para um serviço conhecido do catálogo. Campos: title, service (slug), severity (low|medium|high|critical).",
      schema: z.object({
        title: z.string().min(1),
        service: z.string().min(1),
        severity: severitySchema,
      }),
    },
  );

  const resolver_incident = tool(
    async ({ id }) => {
      try {
        const result = resolveIncident(holder.current, id);
        holder.current = result.store;
        return JSON.stringify(result.incident);
      } catch (error: unknown) {
        return asObservation(error);
      }
    },
    {
      name: "resolver_incident",
      description: "Resolve um incidente pelo id. Se já estiver resolvido, confirma o estado.",
      schema: z.object({
        id: z.number().int().positive(),
      }),
    },
  );

  return {
    holder,
    tools: [list_alertas, open_incident, resolver_incident],
  };
}

export const opsTools = createOpsTools().tools;
