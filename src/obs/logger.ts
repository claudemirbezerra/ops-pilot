export type LogWriter = (line: string) => void;

export type TraceLogMeta = {
  requestId: string;
  seq: number;
  type: string;
  node?: string;
  ts: number;
};

export type RequestLifeMeta = {
  requestId: string;
  event: "request_start" | "request_end";
  status?: "ok" | "error";
  ts: number;
  type?: string;
  node?: string;
  route?: string;
  tokens?: number;
};

export type ObsLogger = {
  logTraceEvent(meta: TraceLogMeta): void;
  logRequestLife(meta: RequestLifeMeta): void;
  /** Metadata-only JSON line (same as answerNode `log.info(...)`). */
  info(meta: Record<string, unknown>): void;
};

function defaultWriter(line: string): void {
  process.stdout.write(line);
}

function writeJson(writer: LogWriter, meta: Record<string, unknown>): void {
  writer(`${JSON.stringify(meta)}\n`);
}

export function createLogger(writer: LogWriter = defaultWriter): ObsLogger {
  return {
    logTraceEvent(meta: TraceLogMeta): void {
      const line: Record<string, unknown> = {
        requestId: meta.requestId,
        seq: meta.seq,
        type: meta.type,
        ts: meta.ts,
      };
      if (meta.node !== undefined) {
        line.node = meta.node;
      }
      writeJson(writer, line);
    },
    logRequestLife(meta: RequestLifeMeta): void {
      const line: Record<string, unknown> = {
        requestId: meta.requestId,
        event: meta.event,
        ts: meta.ts,
        type: meta.type ?? meta.event,
      };
      if (meta.status !== undefined) {
        line.status = meta.status;
      }
      if (meta.node !== undefined) {
        line.node = meta.node;
      }
      if (meta.route !== undefined) {
        line.route = meta.route;
      }
      if (meta.tokens !== undefined) {
        line.tokens = meta.tokens;
      }
      writeJson(writer, line);
    },
    info(meta: Record<string, unknown>): void {
      writeJson(writer, meta);
    },
  };
}
