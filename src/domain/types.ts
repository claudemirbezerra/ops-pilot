export type ServiceTier = "critical" | "high" | "standard";
export type AlertStatus = "firing" | "resolved";
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "resolved";

export type ServiceRecord = {
  slug: string;
  name: string;
  description: string;
  tier: ServiceTier;
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
  createdAt: number;
  resolvedAt: number | null;
  summary: string | null;
};

export type RunbookRecord = {
  service: string;
  content: string;
};

export type SeedPayload = {
  services: ServiceRecord[];
  alerts: AlertRecord[];
  runbooks: RunbookRecord[];
};

export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  role: ConversationRole;
  content: string;
};

export type ConversationStore = {
  create(): string;
  append(conversationId: string, message: ConversationMessage): void;
  lastMessages(conversationId: string, limit: number): ConversationMessage[];
};

export type MemoryRecord = {
  id: string;
  userId: string;
  fact: string;
  createdAt: number;
};

export type RecalledMemory = MemoryRecord & { score: number };

export type Embedder = {
  embed(text: string): Promise<Float32Array>;
};

export type MemoryStore = {
  remember(userId: string, fact: string): Promise<MemoryRecord>;
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
  forget(userId: string, memoryId: string): void;
};

export type OpsStore = {
  seed(data: SeedPayload): void;
  listAlerts(status: AlertStatus | "all"): AlertRecord[];
  listIncidents(status: IncidentStatus | "all"): IncidentRecord[];
  openIncident(input: {
    title: string;
    service: string;
    severity: Severity;
  }): IncidentRecord;
  resolveIncident(id: number, summary?: string | null): IncidentRecord;
  getRunbook(service: string): RunbookRecord;
};
