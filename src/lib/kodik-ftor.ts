import "server-only";

import { getPlayerProxyUrlForParser } from "@/lib/admin/player-proxy-settings";
import {
  parseKodikParserSkipTimes,
  type KodikParserSkipTimes,
} from "@/lib/kodik-parser-skip";
import { normalizeKodikPlayerLinkForCompare, toKodikPlayerEmbedUrl } from "@/lib/player-url";

export const KODIK_PARSER_BASE_DEFAULT = "https://figame.dygdyg.win/kodik_parser/";

/** PHP curl waits 35s and the script limit is 45s. Cut earlier and Cloudflare shows HTML instead of the stream. */
const PARSER_TIMEOUT_MS = 40_000;

export type KodikFtorTiles = {
  interval: number;
  width: number;
  x: number;
  y: number;
  pattern: string;
};

export type KodikFtorStreamResult = {
  domain: string | null;
  defaultQuality: number | null;
  qualities: Record<string, string>;
  tiles: KodikFtorTiles | null;
  ip: string | null;
  /** OP/ED from parser HTML (`skip_timings` / `skip_raw`), when present. */
  skips: KodikParserSkipTimes | null;
};

type RawFtorLinkItem = {
  src?: unknown;
  type?: unknown;
};

type RawFtorResponse = {
  domain?: unknown;
  default?: unknown;
  links?: unknown;
  tiles?: unknown;
  ip?: unknown;
  skip_timings?: unknown;
  skipTimings?: unknown;
  skip_raw?: unknown;
  skipRaw?: unknown;
  skip_genre?: unknown;
  skipGenre?: unknown;
  skip_source?: unknown;
  skipSource?: unknown;
};

export function getKodikParserBase(): string {
  const fromEnv = process.env.KODIK_PARSER_BASE?.trim() || process.env.KODIK_FTOR_PARSER_URL?.trim();
  const base = (fromEnv || KODIK_PARSER_BASE_DEFAULT).replace(/\/?$/, "/");
  return base;
}

/** ROT18 letters + base64 → protocol-relative or absolute stream path (as in Kodik player JS). */
export function kodikDecodeSrc(src: string): string {
  const rot = src.replace(/[a-zA-Z]/g, (ch) => {
    const lim = ch <= "Z" ? 90 : 122;
    let code = ch.charCodeAt(0) + 18;
    if (code > lim) code -= 26;
    return String.fromCharCode(code);
  });
  const pad = "=".repeat((4 - (rot.length % 4)) % 4);
  try {
    return Buffer.from(rot + pad, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function kodikSrcToHttpsUrl(src: string): string | null {
  const decoded = kodikDecodeSrc(src).trim();
  if (!decoded) return null;
  if (decoded.startsWith("//")) return `https:${decoded}`;
  if (decoded.startsWith("https://") || decoded.startsWith("http://")) return decoded;
  return null;
}

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parseTiles(raw: unknown): KodikFtorTiles | null {
  if (!raw || typeof raw !== "object") return null;
  const tiles = raw as Record<string, unknown>;
  const pattern = typeof tiles.pattern === "string" ? tiles.pattern.trim() : "";
  if (!pattern) return null;
  return {
    interval: asPositiveInt(tiles.interval) ?? 5,
    width: asPositiveInt(tiles.width) ?? 160,
    x: asPositiveInt(tiles.x) ?? 5,
    y: asPositiveInt(tiles.y) ?? 5,
    pattern,
  };
}

export function parseKodikFtorResponse(raw: unknown): KodikFtorStreamResult {
  const data = (raw && typeof raw === "object" ? raw : {}) as RawFtorResponse;
  const qualities: Record<string, string> = {};
  const links = data.links;

  if (links && typeof links === "object") {
    for (const [quality, items] of Object.entries(links as Record<string, unknown>)) {
      if (!Array.isArray(items) || items.length === 0) continue;
      const first = items[0] as RawFtorLinkItem;
      if (typeof first?.src !== "string" || !first.src.trim()) continue;
      const url = kodikSrcToHttpsUrl(first.src);
      if (url) qualities[quality] = url;
    }
  }

  const defaultQuality = asPositiveInt(data.default);
  return {
    domain: typeof data.domain === "string" ? data.domain : null,
    defaultQuality:
      defaultQuality != null && qualities[String(defaultQuality)]
        ? defaultQuality
        : asPositiveInt(Object.keys(qualities).sort((a, b) => Number(b) - Number(a))[0]) ?? null,
    qualities,
    tiles: parseTiles(data.tiles),
    ip: typeof data.ip === "string" ? data.ip : null,
    skips: parseKodikParserSkipTimes(data),
  };
}

const STREAM_CACHE_SKEW_MS = 10 * 60 * 1000;

type StreamCacheEntry = {
  value: KodikFtorStreamResult;
  expiresAt: number;
};

const ftorGlobal = globalThis as typeof globalThis & {
  __taKodikFtorCache?: Map<string, StreamCacheEntry>;
  __taKodikFtorInflight?: Map<string, Promise<KodikFtorStreamResult>>;
};

function streamCache(): Map<string, StreamCacheEntry> {
  if (!ftorGlobal.__taKodikFtorCache) ftorGlobal.__taKodikFtorCache = new Map();
  return ftorGlobal.__taKodikFtorCache;
}

function streamInflight(): Map<string, Promise<KodikFtorStreamResult>> {
  if (!ftorGlobal.__taKodikFtorInflight) ftorGlobal.__taKodikFtorInflight = new Map();
  return ftorGlobal.__taKodikFtorInflight;
}

/** CDN path hour `YYYYMMDDHH` is UTC. Missing stamp → do not cache. */
function streamCacheExpiryMs(result: KodikFtorStreamResult): number | null {
  const urls = Object.values(result.qualities);
  if (urls.length === 0) return null;
  let earliest: number | null = null;
  for (const url of urls) {
    const match = /:(\d{10})(?=\/)/.exec(url);
    if (!match) return null;
    const stamp = match[1]!;
    const year = Number(stamp.slice(0, 4));
    const month = Number(stamp.slice(4, 6));
    const day = Number(stamp.slice(6, 8));
    const hour = Number(stamp.slice(8, 10));
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;
    const ms = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
    if (!Number.isFinite(ms)) return null;
    earliest = earliest == null ? ms : Math.min(earliest, ms);
  }
  if (earliest == null) return null;
  const expiresAt = earliest - STREAM_CACHE_SKEW_MS;
  return expiresAt > Date.now() ? expiresAt : null;
}

function readStreamCache(key: string): KodikFtorStreamResult | null {
  const entry = streamCache().get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    streamCache().delete(key);
    return null;
  }
  return entry.value;
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function requestKodikFtorStreams(embed: string): Promise<KodikFtorStreamResult> {
  const parserUrl = new URL(getKodikParserBase());
  parserUrl.searchParams.set("url", embed);

  const headers: Record<string, string> = { Accept: "application/json" };
  const proxyUrl = await getPlayerProxyUrlForParser();
  if (proxyUrl) headers["X-Kodik-Proxy"] = proxyUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);
  try {
    const res = await fetch(parserUrl.href, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Парсер Kodik ответил HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    const parsed = parseKodikFtorResponse(json);
    if (Object.keys(parsed.qualities).length === 0) {
      throw new Error("Парсер не вернул потоки");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Таймаут парсера Kodik");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type FetchKodikFtorStreamsOptions = {
  /** Drop in-memory entry and re-hit the parser (dead CDN links before TTL). */
  bypassCache?: boolean;
};

export async function fetchKodikFtorStreams(
  playerLink: string,
  signal?: AbortSignal,
  options?: FetchKodikFtorStreamsOptions,
): Promise<KodikFtorStreamResult> {
  const embed = toKodikPlayerEmbedUrl(playerLink.trim());
  if (!embed) {
    throw new Error("Пустая ссылка плеера Kodik");
  }

  const key = normalizeKodikPlayerLinkForCompare(embed);
  if (options?.bypassCache) {
    streamCache().delete(key);
  } else {
    const cached = readStreamCache(key);
    if (cached) return cached;
  }
  if (signal?.aborted) throw abortError();

  const inflight = streamInflight().get(key);
  if (inflight) return raceAbort(inflight, signal);

  const promise = requestKodikFtorStreams(embed)
    .then((result) => {
      const expiresAt = streamCacheExpiryMs(result);
      if (expiresAt != null) streamCache().set(key, { value: result, expiresAt });
      return result;
    })
    .finally(() => {
      streamInflight().delete(key);
    });
  streamInflight().set(key, promise);
  return raceAbort(promise, signal);
}
