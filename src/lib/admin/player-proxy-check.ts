import { playerProxyLogLabel } from "@/lib/admin/player-proxy-settings";
import { getKodikParserBase, parseKodikFtorResponse } from "@/lib/kodik-ftor";

/** Серия, которая с IP сервера без прокси отвечает отказом по стране. */
const PROBE_EMBED_URL =
  "https://kodikplayer.com/seria/1681158/380246f1829936a3036bb02f8d082b9b/720p";

const DIRECT_TIMEOUT_MS = 20_000;
const PROXY_TIMEOUT_MS = 80_000;

export const PLAYER_PROXY_PROBE = {
  title: "Необъятный океан",
  season: 3,
  episode: 8,
} as const;

export type PlayerProxyCheckLeg = {
  ok: boolean;
  regionBlocked: boolean;
  qualities: string[];
  message: string;
  ms: number;
};

export type PlayerProxyCheckResult = {
  title: string;
  season: number;
  episode: number;
  proxyLabel: string;
  direct: PlayerProxyCheckLeg;
  viaProxy: PlayerProxyCheckLeg;
};

function isRegionBlocked(text: string): boolean {
  return /запрещено к просмотру/i.test(text) && /стран|регион/i.test(text);
}

function sanitizeParserError(text: string): string {
  return text
    .replace(/\| cookies:[\s\S]*?(?=\| body:|$)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function legFromBody(text: string, ms: number): PlayerProxyCheckLeg {
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = null;
  }

  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") {
    const error = sanitizeParserError(json.error);
    if (isRegionBlocked(error)) {
      return {
        ok: false,
        regionBlocked: true,
        qualities: [],
        message: "Видео запрещено к просмотру в этой стране",
        ms,
      };
    }
    return { ok: false, regionBlocked: false, qualities: [], message: error || "Ошибка парсера", ms };
  }

  const parsed = json ? parseKodikFtorResponse(json) : null;
  const qualities = parsed
    ? Object.keys(parsed.qualities).sort((a, b) => Number(b) - Number(a))
    : [];
  if (qualities.length > 0) {
    return {
      ok: true,
      regionBlocked: false,
      qualities,
      message: `Поток получен: ${qualities.join(", ")}`,
      ms,
    };
  }
  if (!json) {
    return { ok: false, regionBlocked: false, qualities: [], message: "Парсер вернул не JSON", ms };
  }
  return { ok: false, regionBlocked: false, qualities: [], message: "Парсер не вернул поток", ms };
}

async function probeParser(proxyUrl: string | null, timeoutMs: number): Promise<PlayerProxyCheckLeg> {
  const started = Date.now();
  const parserUrl = new URL(getKodikParserBase());
  parserUrl.searchParams.set("url", PROBE_EMBED_URL);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (proxyUrl) headers["X-Kodik-Proxy"] = proxyUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(parserUrl.href, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    return legFromBody(text, Date.now() - started);
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        regionBlocked: false,
        qualities: [],
        message: "Парсер не ответил вовремя",
        ms,
      };
    }
    return {
      ok: false,
      regionBlocked: false,
      qualities: [],
      message: "Не удалось связаться с парсером",
      ms,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPlayerProxy(proxyUrl: string): Promise<PlayerProxyCheckResult> {
  const [direct, viaProxy] = await Promise.all([
    probeParser(null, DIRECT_TIMEOUT_MS),
    probeParser(proxyUrl, PROXY_TIMEOUT_MS),
  ]);
  return {
    title: PLAYER_PROXY_PROBE.title,
    season: PLAYER_PROXY_PROBE.season,
    episode: PLAYER_PROXY_PROBE.episode,
    proxyLabel: playerProxyLogLabel(proxyUrl),
    direct,
    viaProxy,
  };
}
