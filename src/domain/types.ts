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

export type StoredMessage = ConversationMessage & { id: number };

export type ConversationSummaryRecord = {
  text: string;
  coveredThroughId: number;
};

export type ConversationStore = {
  create(): string;
  append(conversationId: string, message: ConversationMessage): void;
  lastMessages(conversationId: string, limit: number): ConversationMessage[];
  getSummary(conversationId: string): ConversationSummaryRecord | null;
  upsertSummary(
    conversationId: string,
    text: string,
    coveredThroughId: number,
  ): void;
  listUnsummarizedOutsideWindow(
    conversationId: string,
    windowSize: number,
    coveredThroughId: number,
  ): StoredMessage[];
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

/** Trace payload stored for a request; kept loose to avoid domain→agents cycles. */
export type PersistedTraceEvent = {
  type: string;
  node?: string;
  [key: string]: unknown;
};

export type SavedRequest = {
  requestId: string;
  createdAt: number;
  metrics: Record<string, unknown>;
  trace: PersistedTraceEvent[];
};

export type RequestStore = {
  save(input: {
    id: string;
    createdAt: number;
    metrics: SavedRequest["metrics"];
    trace: PersistedTraceEvent[];
  }): void;
  getById(id: string): SavedRequest | null;
};
