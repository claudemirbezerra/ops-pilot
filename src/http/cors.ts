import type { NextFunction, Request, Response } from "express";

export function parseCorsAllowlist(
  raw: string | undefined,
): ReadonlySet<string> | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const origins = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return origins.length > 0 ? new Set(origins) : null;
}

export function resolveAllowedOrigin(
  requestOrigin: string | undefined,
  allowlist: ReadonlySet<string> | null,
): string | null {
  if (requestOrigin === undefined || requestOrigin.length === 0) {
    return null;
  }
  if (allowlist === null) {
    return requestOrigin;
  }
  return allowlist.has(requestOrigin) ? requestOrigin : null;
}

export type CorsMiddlewareOptions = {
  /** Override env; default reads process.env.OPSPILOT_CORS_ORIGINS */
  originsEnv?: string | undefined;
};

/**
 * Reflect Origin or allowlist from OPSPILOT_CORS_ORIGINS.
 * Does not use Access-Control-Allow-Origin: * as sole policy.
 */
export function createCorsMiddleware(
  options: CorsMiddlewareOptions = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const allowlist = parseCorsAllowlist(
    options.originsEnv !== undefined
      ? options.originsEnv
      : process.env.OPSPILOT_CORS_ORIGINS,
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    const originHeader = req.header("Origin");
    const allowed = resolveAllowedOrigin(originHeader, allowlist);

    if (allowed !== null) {
      res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Request-Id",
      );
      res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
