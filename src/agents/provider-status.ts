import { z } from "zod";

export type ProviderId = "github" | "cloudflare";

export type FetchImpl = typeof globalThis.fetch;

export const PROVIDER_STATUS_URLS = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const satisfies Record<ProviderId, string>;

export const statusPageBodySchema = z.object({
  status: z.object({
    indicator: z.string().min(1),
    description: z.string().min(1),
  }),
});

export function formatProviderStatusLine(status: {
  indicator: string;
  description: string;
}): string {
  return `${status.indicator} — ${status.description}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String((error as { name: unknown }).name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

function isRetryableFailure(error: unknown): boolean {
  if (isAbortError(error)) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error && /status code [5]\d\d/.test(error.message)) {
    return true;
  }
  return false;
}

/**
 * Consulta a status page pública do provedor.
 * Sempre retorna string (sucesso compacto ou erro legível); nunca lança.
 */
export async function fetchProviderStatus(
  provider: ProviderId,
  doFetch: FetchImpl = globalThis.fetch,
): Promise<string> {
  const url = PROVIDER_STATUS_URLS[provider];
  const limitationHint =
    " Responda com base nos alertas internos e avise o plantonista da limitação do serviço.";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await doFetch(url, {
        signal: AbortSignal.timeout(5_000),
      });

      if (response.status >= 500) {
        throw new Error(`${provider} status code ${response.status}`);
      }

      if (!response.ok) {
        return `status page de ${provider} respondeu ${response.status} ${response.statusText}.${limitationHint}`;
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (error: unknown) {
        return `status page de ${provider} retornou JSON inválido: ${errorMessage(error)}.${limitationHint}`;
      }

      const parsed = statusPageBodySchema.safeParse(json);
      if (!parsed.success) {
        return `status page de ${provider}: resposta inválida.${limitationHint}`;
      }

      return formatProviderStatusLine(parsed.data.status);
    } catch (error: unknown) {
      const retryable = isRetryableFailure(error);
      if (attempt === 1 && retryable) {
        continue;
      }
      return `status page de ${provider} não respondeu: ${errorMessage(error)}.${limitationHint}`;
    }
  }

  return `status page de ${provider} não respondeu.${limitationHint}`;
}
