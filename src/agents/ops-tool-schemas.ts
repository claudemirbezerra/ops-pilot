import { z } from "zod";

export const LIST_ALERTS_DESCRIPTION =
  "Lista alertas de monitoramento por status. Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou o inventário de alertas. Não use para incidentes formais (use list_incidents) nem para procedimentos (use consultar_runbook).";

export const OPEN_INCIDENT_DESCRIPTION =
  "Abre um incidente formal para um serviço do catálogo. Sempre chame esta ferramenta quando o plantonista pedir para abrir/registrar um incidente — a confirmação humana ocorre automaticamente depois da chamada. Não explique o fluxo de aprovação em texto nem peça para o plantonista abrir manualmente. Não use só para consultar alertas; se o incidente já existe, use list_incidents ou resolver_incident.";

export const RESOLVE_INCIDENT_DESCRIPTION =
  "Resolve um incidente pelo id numérico. Sempre chame esta ferramenta quando o plantonista pedir para resolver/fechar um incidente — a confirmação humana ocorre automaticamente depois da chamada. Não explique o fluxo de aprovação em texto. Não use para criar incidente novo nem para listar estado.";

export const listAlertsInputSchema = z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe(
      'Filtro: "firing" (ativos), "resolved" (encerrados), "all" (todos). Default firing.',
    ),
});

export const openIncidentInputSchema = z.object({
  title: z.string().min(1).describe("Título curto do incidente"),
  service: z
    .string()
    .min(1)
    .describe("Slug do serviço afetado (ex.: payments, checkout, auth)"),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .describe("Severidade: low | medium | high | critical"),
});

export const resolveIncidentInputSchema = z.object({
  id: z.number().int().positive().describe("ID numérico do incidente"),
  summary: z
    .string()
    .min(1)
    .optional()
    .describe("Resumo opcional da resolução (o que foi feito)"),
});
