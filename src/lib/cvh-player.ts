/**
 * CDN VideoHub (CVH) player helpers for Track Anime.
 * Widget: player.cdnvideohub.com · playlist: plapi.cdnvideohub.com
 */

import { resolveTranslationStudioId } from "@/lib/translation-colors";

export const CVH_PLAYER_SCRIPT_URL =
  "https://player.cdnvideohub.com/s2/stable/video-player.umd.js";

export const CVH_PLAPI_BASE_DEFAULT = "https://plapi.cdnvideohub.com";

/** Default publisher id for track-anime.dygdyg.ru */
export const CVH_PUB_DEFAULT = "10326";

export type CvhAggregator = "mal" | "mali" | "shikimori" | "kp" | "cvh";

export type CvhPlaylistItem = {
  cvhId: string;
  vkId: string;
  voiceStudio: string | null;
  voiceType: string | null;
  season: number;
  episode: number;
  name?: string;
};

/**
 * Numeric restriction tags from plapi playlist (video-player.umd.js enum):
 * Licensed=1, LGBT=3, Blocked=5.
 */
export const CVH_PLAYLIST_TAG = {
  licensed: 1,
  lgbt: 3,
  blocked: 5,
} as const;

export type CvhRestrictionMarkers = {
  licensed: boolean;
  lgbt: boolean;
  blocked: boolean;
};

export type CvhPlaylistResponse = {
  titleName: string | null;
  isSerial: boolean;
  items: CvhPlaylistItem[];
  /** plapi `tags` — restriction codes (see CVH_PLAYLIST_TAG) */
  tags: number[];
};

export type CvhVoiceOption = {
  studio: string;
  episodeCount: number;
};

export function getCvhPub(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_CVH_PUB?.trim() ||
    process.env.CVH_PUB?.trim() ||
    "";
  return fromEnv || CVH_PUB_DEFAULT;
}

export function getCvhPlapiBase(): string {
  const fromEnv =
    process.env.CVH_PLAPI_URL?.trim() ||
    process.env.NEXT_PUBLIC_CVH_PLAPI_URL?.trim() ||
    "";
  return (fromEnv || CVH_PLAPI_BASE_DEFAULT).replace(/\/$/, "");
}

export function getCvhDefaultAggregator(): CvhAggregator {
  const raw = (process.env.CVH_AGGR || process.env.NEXT_PUBLIC_CVH_AGGR || "mal")
    .trim()
    .toLowerCase();
  if (
    raw === "kp" ||
    raw === "cvh" ||
    raw === "mali" ||
    raw === "mal" ||
    raw === "shikimori"
  ) {
    return raw;
  }
  return "mal";
}

/** MAL fallback aggregator for playlist/widget when Shikimori lookup misses. */
export function getCvhMalAggregator(): CvhAggregator {
  const preferred = getCvhDefaultAggregator();
  if (preferred === "mal" || preferred === "mali") return preferred;
  return "mal";
}

export function isCvhPlaylistPresent(
  playlist: CvhPlaylistResponse | null | undefined,
): playlist is CvhPlaylistResponse {
  return Boolean(playlist && playlist.items.length > 0);
}

export type CvhIframeParams = {
  aggr: CvhAggregator;
  id: string;
  episode?: number | null;
  season?: number | null;
  voice?: string | null;
  pub?: string;
};

export function buildCvhIframePath(params: CvhIframeParams): string {
  const search = new URLSearchParams();
  search.set("pub", params.pub?.trim() || getCvhPub());
  search.set("aggr", params.aggr);
  search.set("id", params.id);
  if (params.episode != null && Number.isFinite(params.episode) && params.episode > 0) {
    search.set("episode", String(Math.trunc(params.episode)));
  }
  if (params.season != null && Number.isFinite(params.season) && params.season > 0) {
    search.set("season", String(Math.trunc(params.season)));
  }
  if (params.voice?.trim()) {
    search.set("voice", params.voice.trim());
  }
  return `/cdn-iframe?${search.toString()}`;
}

export function parseCvhPlaylistTags(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const tags: number[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    const value = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isFinite(value)) continue;
    const code = Math.trunc(value);
    if (seen.has(code)) continue;
    seen.add(code);
    tags.push(code);
  }
  return tags;
}

export function markersFromCvhPlaylistTags(
  tags: readonly number[] | null | undefined,
): CvhRestrictionMarkers {
  const set = new Set(tags ?? []);
  return {
    licensed: set.has(CVH_PLAYLIST_TAG.licensed),
    lgbt: set.has(CVH_PLAYLIST_TAG.lgbt),
    blocked: set.has(CVH_PLAYLIST_TAG.blocked),
  };
}

export function mergeCvhRestrictionMarkers(
  ...parts: Array<CvhRestrictionMarkers | null | undefined>
): CvhRestrictionMarkers {
  return {
    licensed: parts.some((part) => part?.licensed),
    lgbt: parts.some((part) => part?.lgbt),
    blocked: parts.some((part) => part?.blocked),
  };
}

export function hasCvhRestrictionMarkers(
  markers: CvhRestrictionMarkers | null | undefined,
): boolean {
  return Boolean(markers && (markers.licensed || markers.lgbt || markers.blocked));
}

export function emptyCvhRestrictionMarkers(): CvhRestrictionMarkers {
  return { licensed: false, lgbt: false, blocked: false };
}

export function parseCvhPlaylistPayload(raw: unknown): CvhPlaylistResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: CvhPlaylistItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const vkId = row.vkId != null ? String(row.vkId) : "";
    const cvhId = row.cvhId != null ? String(row.cvhId) : "";
    if (!vkId && !cvhId) continue;
    const season = Number(row.season);
    const episode = Number(row.episode);
    items.push({
      cvhId,
      vkId,
      voiceStudio: typeof row.voiceStudio === "string" ? row.voiceStudio : null,
      voiceType: typeof row.voiceType === "string" ? row.voiceType : null,
      season: Number.isFinite(season) && season > 0 ? Math.trunc(season) : 1,
      episode: Number.isFinite(episode) && episode > 0 ? Math.trunc(episode) : 1,
      name: typeof row.name === "string" ? row.name : undefined,
    });
  }
  return {
    titleName: typeof data.titleName === "string" ? data.titleName : null,
    isSerial: data.isSerial === true,
    items,
    tags: parseCvhPlaylistTags(data.tags),
  };
}

export function listCvhVoices(items: readonly CvhPlaylistItem[]): CvhVoiceOption[] {
  const byStudio = new Map<string, number>();
  for (const item of items) {
    const studio = (item.voiceStudio || item.voiceType || "Неизвестно").trim() || "Неизвестно";
    byStudio.set(studio, (byStudio.get(studio) ?? 0) + 1);
  }
  return [...byStudio.entries()]
    .map(([studio, episodeCount]) => ({ studio, episodeCount }))
    .sort((a, b) => b.episodeCount - a.episodeCount || a.studio.localeCompare(b.studio, "ru"));
}

export function listCvhEpisodesForVoice(
  items: readonly CvhPlaylistItem[],
  voice: string | null,
): Array<{ season: number; episode: number }> {
  const filtered = voice
    ? items.filter((item) => (item.voiceStudio || item.voiceType || "Неизвестно") === voice)
    : items;
  const seen = new Set<string>();
  const result: Array<{ season: number; episode: number }> = [];
  for (const item of filtered) {
    const key = `${item.season}:${item.episode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ season: item.season, episode: item.episode });
  }
  return result.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function normalizeCvhVoiceKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

/**
 * Match Kodik/TA translation title to a CVH `voiceStudio` name when possible.
 * Order: exact → shared studio palette id → fuzzy normalized contains.
 */
export function matchCvhVoiceStudio(
  preferredName: string | null | undefined,
  voices: readonly Pick<CvhVoiceOption, "studio">[] | null | undefined,
): string | null {
  const preferred = preferredName?.trim();
  if (!preferred || !voices?.length) return null;

  const preferredLower = preferred.toLowerCase();
  const exact = voices.find((voice) => voice.studio.toLowerCase() === preferredLower);
  if (exact) return exact.studio;

  const preferredStudioId = resolveTranslationStudioId(preferred);
  if (preferredStudioId) {
    const byId = voices.find(
      (voice) => resolveTranslationStudioId(voice.studio) === preferredStudioId,
    );
    if (byId) return byId.studio;
  }

  const preferredKey = normalizeCvhVoiceKey(preferred);
  if (!preferredKey) return null;

  const fuzzy = voices.find((voice) => {
    const key = normalizeCvhVoiceKey(voice.studio);
    return Boolean(key) && (key.includes(preferredKey) || preferredKey.includes(key));
  });
  return fuzzy?.studio ?? null;
}

/**
 * Match a CVH voice studio name back to a Kodik/TA translation title / kodikId.
 * Same order as matchCvhVoiceStudio: exact → studio palette id → fuzzy.
 */
export function matchKodikTranslationForCvhVoice<T extends { translationTitle: string }>(
  cvhVoiceStudio: string | null | undefined,
  translations: readonly T[],
): T | null {
  const preferred = cvhVoiceStudio?.trim();
  if (!preferred || translations.length === 0) return null;

  const preferredLower = preferred.toLowerCase();
  const exact = translations.find(
    (item) => item.translationTitle.trim().toLowerCase() === preferredLower,
  );
  if (exact) return exact;

  const preferredStudioId = resolveTranslationStudioId(preferred);
  if (preferredStudioId) {
    const byId = translations.find(
      (item) => resolveTranslationStudioId(item.translationTitle) === preferredStudioId,
    );
    if (byId) return byId;
  }

  const preferredKey = normalizeCvhVoiceKey(preferred);
  if (!preferredKey) return null;

  const fuzzy = translations.find((item) => {
    const key = normalizeCvhVoiceKey(item.translationTitle);
    return Boolean(key) && (key.includes(preferredKey) || preferredKey.includes(key));
  });
  return fuzzy ?? null;
}

/** Pick CVH episode closest to Kodik/TA season+episode. */
export function pickCvhEpisode(
  options: readonly { season: number; episode: number }[] | null | undefined,
  preferred: { season: number; episode: number } | null | undefined,
): { season: number; episode: number } | null {
  if (!options?.length) return null;
  if (!preferred) return options[0] ?? null;

  const exact = options.find(
    (item) => item.season === preferred.season && item.episode === preferred.episode,
  );
  if (exact) return exact;

  const sameSeason = options.filter((item) => item.season === preferred.season);
  if (sameSeason.length) {
    return sameSeason.reduce((best, item) =>
      Math.abs(item.episode - preferred.episode) < Math.abs(best.episode - preferred.episode)
        ? item
        : best,
    );
  }

  const sameEpisode = options.find((item) => item.episode === preferred.episode);
  return sameEpisode ?? options[0] ?? null;
}

/** Keep under typical reverse-proxy / Cloudflare first-byte budgets. */
export const CVH_PLAYLIST_TIMEOUT_MS = 8_000;

export async function fetchCvhPlaylist(params: {
  pub?: string;
  aggr: CvhAggregator;
  id: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<CvhPlaylistResponse | null> {
  const pub = params.pub?.trim() || getCvhPub();
  const url = new URL(`${getCvhPlapiBase()}/api/v1/player/sv/playlist`);
  url.searchParams.set("pub", pub);
  url.searchParams.set("aggr", params.aggr);
  url.searchParams.set("id", params.id);

  const timeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : CVH_PLAYLIST_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;

  const response = await fetch(url.toString(), {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`CVH playlist HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) return null;
  return parseCvhPlaylistPayload(JSON.parse(text));
}

export type ResolvedCvhPlaylist = {
  playlist: CvhPlaylistResponse;
  aggr: CvhAggregator;
  titleId: string;
  malId: number | null;
};

/**
 * Browser-safe playlist resolve (plapi CORS allows track-anime.win).
 * Prefer Shikimori id, then MAL fallback. Do not call from Node on VPS —
 * outbound to plapi is often blocked there; use the client instead.
 */
export async function resolveCvhPlaylistForAnime(params: {
  shikimoriId: number;
  malId?: number | null;
  signal?: AbortSignal;
}): Promise<ResolvedCvhPlaylist | null> {
  const shikimoriId = params.shikimoriId;
  const malId =
    params.malId != null && Number.isFinite(params.malId) && params.malId > 0
      ? Math.trunc(params.malId)
      : null;

  const shikimoriPlaylist = await fetchCvhPlaylist({
    aggr: "shikimori",
    id: String(shikimoriId),
    signal: params.signal,
  });
  if (isCvhPlaylistPresent(shikimoriPlaylist)) {
    return {
      playlist: shikimoriPlaylist,
      aggr: "shikimori",
      titleId: String(shikimoriId),
      malId,
    };
  }

  if (!malId) return null;

  const malAggregator = getCvhMalAggregator();
  const malPlaylist = await fetchCvhPlaylist({
    aggr: malAggregator,
    id: String(malId),
    signal: params.signal,
  });
  if (!isCvhPlaylistPresent(malPlaylist)) return null;

  return {
    playlist: malPlaylist,
    aggr: malAggregator,
    titleId: String(malId),
    malId,
  };
}

