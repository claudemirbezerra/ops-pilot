import {
  InvalidAlertStatusError,
  InvalidIncidentInputError,
  UnknownIncidentError,
  UnknownServiceError,
} from "../domain/errors.js";
import { primaryCatalog } from "../seed/primary-catalog.js";

export type AlertStatus = "firing" | "resolved";
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "resolved";

export type ServiceRecord = {
  slug: string;
  name: string;
  description: string;
};

export type AlertRecord = {
  serviceSlug: string;
  title: string;
  detail: string;
  status: AlertStatus;
  severity: Severity;
};

export type IncidentRecord = {
  id: number;
  title: string;
  serviceSlug: string;
  severity: Severity;
  status: IncidentStatus;
};

export type Store = {
  services: ServiceRecord[];
  alerts: AlertRecord[];
  incidents: IncidentRecord[];
  nextIncidentId: number;
};

export type CatalogCounts = {
  services: number;
  alerts: number;
  firing: number;
  resolved: number;
};

export function createStoreFromPrimaryCatalog(): Store {
  return {
    services: primaryCatalog.services.map((service) => ({ ...service })),
    alerts: primaryCatalog.alerts.map((alert) => ({ ...alert })),
    incidents: [],
    nextIncidentId: 1,
  };
}

export function summarizeStore(store: Store): CatalogCounts {
  return {
    services: store.services.length,
    alerts: store.alerts.length,
    firing: store.alerts.filter((alert) => alert.status === "firing").length,
    resolved: store.alerts.filter((alert) => alert.status === "resolved").length,
  };
}

export function listAlerts(store: Store, status: string): AlertRecord[] {
  if (status !== "firing" && status !== "resolved") {
    throw new InvalidAlertStatusError(
      `Situação de alerta inválida: ${status}. Use firing ou resolved.`,
    );
  }

  return store.alerts.filter((alert) => alert.status === status).map((alert) => ({ ...alert }));
}

export function openIncident(
  store: Store,
  input: { title: string; service: string; severity: Severity },
): { store: Store; incident: IncidentRecord } {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new InvalidIncidentInputError("O título do incidente é obrigatório.");
  }

  const service = store.services.find((item) => item.slug === input.service);
  if (!service) {
    throw new UnknownServiceError(`Serviço desconhecido: ${input.service}.`);
  }

  const incident: IncidentRecord = {
    id: store.nextIncidentId,
    title,
    serviceSlug: service.slug,
    severity: input.severity,
    status: "open",
  };

  return {
    store: {
      ...store,
      incidents: [...store.incidents, incident],
      nextIncidentId: store.nextIncidentId + 1,
    },
    incident,
  };
}

export function resolveIncident(
  store: Store,
  id: number,
): { store: Store; incident: IncidentRecord } {
  if (!Number.isInteger(id) || id < 1) {
    throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
  }

  const index = store.incidents.findIndex((item) => item.id === id);
  if (index < 0) {
    throw new UnknownIncidentError(`Incidente desconhecido: ${id}.`);
  }

  const current = store.incidents[index]!;
  const incident: IncidentRecord = { ...current, status: "resolved" };
  const incidents = store.incidents.slice();
  incidents[index] = incident;

  return {
    store: { ...store, incidents },
    incident,
  };
}

export type StoreHolder = {
  current: Store;
};

export function createStoreHolder(store: Store = createStoreFromPrimaryCatalog()): StoreHolder {
  return { current: store };
}
