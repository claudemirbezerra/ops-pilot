export const API_BASE_STORAGE_KEY = "opspilot.warRoom.apiBaseUrl";
export const DEFAULT_API_BASE = "http://127.0.0.1:3000";

export function normalizeApiBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function isValidApiBase(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getApiBaseUrl(
  storage: Pick<Storage, "getItem"> = localStorage,
): string {
  const stored = storage.getItem(API_BASE_STORAGE_KEY);
  if (stored === null || !isValidApiBase(stored)) {
    return DEFAULT_API_BASE;
  }
  return normalizeApiBase(stored);
}

export function setApiBaseUrl(
  raw: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!isValidApiBase(raw)) {
    return {
      ok: false,
      error: "Informe uma URL absoluta http ou https.",
    };
  }
  const value = normalizeApiBase(raw);
  storage.setItem(API_BASE_STORAGE_KEY, value);
  return { ok: true, value };
}
