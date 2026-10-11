import "server-only";

import { toKodikPlayerEmbedUrl } from "@/lib/player-url";

export const KODIK_PARSER_BASE_DEFAULT = "https://figame.dygdyg.win/kodik_parser/";

const PARSER_TIMEOUT_MS = 20_000;

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
  };
}

export async function fetchKodikFtorStreams(
  playerLink: string,
  signal?: AbortSignal,
): Promise<KodikFtorStreamResult> {
  const embed = toKodikPlayerEmbedUrl(playerLink.trim());
  if (!embed) {
    throw new Error("Пустая ссылка плеера Kodik");
  }

  const parserUrl = new URL(getKodikParserBase());
  parserUrl.searchParams.set("url", embed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(parserUrl.href, {
      method: "GET",
      headers: { Accept: "application/json" },
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
    signal?.removeEventListener("abort", onAbort);
  }
}
