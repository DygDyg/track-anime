import "dotenv/config";
import { kodikRateLimit, sleep } from "./rate-limiter";

function getConfig() {
  const token = process.env.KODIK_API_TOKEN;
  const baseUrl = process.env.KODIK_API_URL ?? "https://kodik-api.com";

  if (!token) {
    throw new Error("KODIK_API_TOKEN не задан в .env");
  }

  return { token, baseUrl };
}

function getUserAgent(): string {
  return process.env.KODIK_USER_AGENT ?? "TrackAnime/0.1";
}

function getMaxAttempts(): number {
  const raw = Number(process.env.KODIK_FETCH_ATTEMPTS ?? 8);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 8;
}

function getRequestTimeoutMs(): number {
  const raw = Number(process.env.KODIK_REQUEST_TIMEOUT_MS ?? 60_000);
  return Number.isFinite(raw) && raw >= 10_000 ? Math.floor(raw) : 60_000;
}

function isRetryableError(error: unknown, status?: number): boolean {
  if (status === 429 || (status != null && status >= 500)) return true;
  if (!(error instanceof Error)) return false;

  const parts = [error.message.toLowerCase()];
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    parts.push(cause.message.toLowerCase());
    const code = (cause as Error & { code?: string }).code;
    if (code) parts.push(code.toLowerCase());
  }

  const msg = parts.join(" ");
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("connect timeout") ||
    msg.includes("und_err_connect_timeout") ||
    msg.includes("socket") ||
    msg.includes("abort")
  );
}

export async function kodikFetch<T>(url: string): Promise<T> {
  let lastError: Error | null = null;
  const maxAttempts = getMaxAttempts();
  const timeoutMs = getRequestTimeoutMs();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let status: number | undefined;

    try {
      await kodikRateLimit();

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": getUserAgent(),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      status = response.status;

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`Kodik API ${response.status}: ${body.slice(0, 300)}`);
        if (isRetryableError(error, status) && attempt < maxAttempts) {
          lastError = error;
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isRetryableError(error, status) && attempt < maxAttempts) {
        const waitMs = 1000 * 2 ** (attempt - 1);
        console.warn(`[kodik] попытка ${attempt}/${maxAttempts} не удалась, повтор через ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Kodik fetch failed");
}

export function buildListUrl(params: Record<string, string | number | boolean | undefined>): string {
  const { token, baseUrl } = getConfig();
  const search = new URLSearchParams();
  search.set("token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  return `${baseUrl}/list?${search.toString()}`;
}

export async function kodikListPage(
  params: Record<string, string | number | boolean | undefined>,
): Promise<import("./types.js").KodikListResponse> {
  return kodikFetch(buildListUrl(params));
}

export async function kodikListByUrl(url: string): Promise<import("./types.js").KodikListResponse> {
  return kodikFetch(url);
}

export async function kodikSearch(
  params: Record<string, string | number | boolean | undefined>,
): Promise<import("./types.js").KodikSearchResponse> {
  const { token, baseUrl } = getConfig();
  const search = new URLSearchParams();
  search.set("token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  return kodikFetch(`${baseUrl}/search?${search.toString()}`);
}
