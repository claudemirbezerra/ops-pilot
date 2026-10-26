import {
  InvalidAlertStatusError,
  InvalidIncidentInputError,
  RunbookNotFoundError,
  UnknownIncidentError,
  UnknownServiceError,
} from "../domain/errors.js";
import type {
  AlertRecord,
  AlertStatus,
  IncidentRecord,
  IncidentStatus,
  OpsStore,
  RunbookRecord,
  SeedPayload,
  ServiceRecord,
  Severity,
} from "../domain/types.js";

export class InMemoryOpsStore implements OpsStore {
  private services = new Map<string, ServiceRecord>();
  private alerts: AlertRecord[] = [];
  private incidents: IncidentRecord[] = [];
  private runbooks = new Map<string, RunbookRecord>();
  private nextIncidentId = 1;

  seed(data: SeedPayload): void {
    for (const service of data.services) {
      if (!this.services.has(service.slug)) {
        this.services.set(service.slug, { ...service });
      }
    }

    for (const alert of data.alerts) {
      const exists = this.alerts.some(
        (item) =>
          item.serviceSlug === alert.serviceSlug && item.title === alert.title,
      );
      if (!exists) {
        this.alerts.push({ ...alert });
      }
    }

    for (const runbook of data.runbooks) {
      if (!this.runbooks.has(runbook.service)) {
        this.runbooks.set(runbook.service, { ...runbook });
      }
    }
  }

  listAlerts(status: AlertStatus | "all"): AlertRecord[] {
    if (status !== "all" && status !== "firing" && status !== "resolved") {
      throw new InvalidAlertStatusError(
        `Situação de alerta inválida: ${status}. Use firing, resolved ou all.`,
      );
    }

    const filtered =
      status === "all"
        ? this.alerts
        : this.alerts.filter((alert) => alert.status === status);

    return filtered.map((alert) => ({ ...alert }));
  }

  listIncidents(status: IncidentStatus | "all"): IncidentRecord[] {
    const filtered =
      status === "all"
        ? this.incidents
        : this.incidents.filter((incident) => incident.status === status);

    return filtered
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((incident) => ({ ...incident }));
  }

  openIncident(input: {
    title: string;
    service: string;
    severity: Severity;
  }): IncidentRecord {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new InvalidIncidentInputError("O título do incidente é obrigatório.");
    }

    if (!this.services.has(input.service)) {
      throw new UnknownServiceError(`Serviço desconhecido: ${input.service}.`);
    }

    const incident: IncidentRecord = {
      id: this.nextIncidentId,
      title,
      serviceSlug: input.service,
      severity: input.severity,
      status: "open",
      createdAt: Date.now(),
      resolvedAt: null,
      summary: null,
    };

    this.nextIncidentId += 1;
    this.incidents.push(incident);
    return { ...incident };
  }

  resolveIncident(id: number, summary?: string | null): IncidentRecord {
    if (!Number.isInteger(id) || id < 1) {
      throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
    }

    const index = this.incidents.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
    }

    const current = this.incidents[index]!;
    if (current.status === "resolved") {
      return { ...current };
    }

    const resolved: IncidentRecord = {
      ...current,
      status: "resolved",
      resolvedAt: Date.now(),
      summary: summary ?? null,
    };
    this.incidents[index] = resolved;
    return { ...resolved };
  }

  getRunbook(service: string): RunbookRecord {
    const runbook = this.runbooks.get(service);
    if (!runbook) {
      throw new RunbookNotFoundError(`Runbook não encontrado: ${service}.`);
    }
    return { ...runbook };
  }
}
