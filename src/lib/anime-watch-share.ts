/** GET-параметры deep-link на плеер страницы тайтла (`/anime/[id]?…#player`). */

export const ANIME_WATCH_QUERY = {
  player: "player",
  season: "season",
  episode: "episode",
  translation: "translation",
  time: "t",
  /** Disables writing UserWatchProgress while the page is open with this flag. */
  nosave: "nosave",
} as const;

export type AnimeWatchPlayerParam = "kodik" | "cvh";

export type AnimeWatchDeepLink = {
  player: AnimeWatchPlayerParam | null;
  season: number | null;
  episode: number | null;
  translationId: number | null;
  positionSeconds: number | null;
  /** When true, auto-save of watch progress is disabled for this visit. */
  disableHistorySave: boolean;
};

export type AnimeWatchShareInput = {
  origin: string;
  shikimoriId: number;
  player: AnimeWatchPlayerParam;
  season: number;
  episode: number;
  translationId?: number | null;
  positionSeconds?: number | null;
  /** Default true — share links include `nosave=1` so recipients keep their own history. */
  disableHistorySave?: boolean;
  /** Preserve existing query keys (e.g. unrelated filters). Default: clean share URL. */
  preserveSearch?: string | null;
};

const EMPTY_DEEP_LINK: AnimeWatchDeepLink = {
  player: null,
  season: null,
  episode: null,
  translationId: null,
  positionSeconds: null,
  disableHistorySave: false,
};

export function parseAnimeWatchPlayerParam(raw: string | null | undefined): AnimeWatchPlayerParam | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "kodik" || value === "ta") return "kodik";
  if (value === "cvh" || value === "videohub" || value === "cdn") return "cvh";
  return null;
}

/** `123`, `1:30`, `1:02:03` → seconds; invalid → null. */
export function parseAnimeWatchTimecode(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return seconds;
  }

  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part) => /^\d+(\.\d+)?$/.test(part))) return null;

  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return null;

  let seconds = 0;
  if (numbers.length === 2) {
    const [mm, ss] = numbers as [number, number];
    if (ss >= 60) return null;
    seconds = mm * 60 + ss;
  } else {
    const [hh, mm, ss] = numbers as [number, number, number];
    if (mm >= 60 || ss >= 60) return null;
    seconds = hh * 3600 + mm * 60 + ss;
  }

  return seconds;
}

function parseOptionalInt(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  return value;
}

/** `1` / `true` / `yes` / bare flag → true; `0` / `false` / `no` → false; missing → false. */
export function parseAnimeWatchFlag(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return false;
}

export function parseAnimeWatchDeepLink(
  search: string | URLSearchParams | null | undefined,
): AnimeWatchDeepLink {
  if (search == null) return { ...EMPTY_DEEP_LINK };
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;

  return {
    player: parseAnimeWatchPlayerParam(params.get(ANIME_WATCH_QUERY.player)),
    season: parseOptionalInt(params.get(ANIME_WATCH_QUERY.season)),
    episode: parseOptionalInt(params.get(ANIME_WATCH_QUERY.episode)),
    translationId: parseOptionalInt(params.get(ANIME_WATCH_QUERY.translation)),
    positionSeconds: parseAnimeWatchTimecode(params.get(ANIME_WATCH_QUERY.time)),
    disableHistorySave: params.has(ANIME_WATCH_QUERY.nosave)
      ? parseAnimeWatchFlag(params.get(ANIME_WATCH_QUERY.nosave))
      : false,
  };
}

export function parseAnimeWatchDeepLinkFromLocation(): AnimeWatchDeepLink {
  if (typeof window === "undefined") return { ...EMPTY_DEEP_LINK };
  return parseAnimeWatchDeepLink(window.location.search);
}

/** True when URL asks for a concrete episode / time / translation (not only player balancer). */
export function hasAnimeWatchDeepLinkTarget(link: AnimeWatchDeepLink): boolean {
  return (
    link.season != null ||
    link.episode != null ||
    link.positionSeconds != null ||
    link.translationId != null
  );
}

export function hasAnimeWatchEpisodeDeepLink(link: AnimeWatchDeepLink): boolean {
  return link.season != null || link.episode != null || link.positionSeconds != null;
}

/** Next.js `searchParams` → deep-link (берёт первый элемент массива). */
export function parseAnimeWatchDeepLinkFromSearchParams(
  searchParams:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | null
    | undefined,
): AnimeWatchDeepLink {
  if (searchParams == null) return { ...EMPTY_DEEP_LINK };
  if (searchParams instanceof URLSearchParams) {
    return parseAnimeWatchDeepLink(searchParams);
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw == null || raw === "") continue;
    params.set(key, raw);
  }
  return parseAnimeWatchDeepLink(params);
}

function formatWatchShareSeasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? "Рекап" : `${seasonNumber} сезон`;
}

function formatWatchShareTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Строка для OG/Telegram/Discord: плеер · сезон · серия · озвучка · таймкод.
 * `null`, если в ссылке нет цели просмотра.
 */
export function buildAnimeWatchShareMetaLine(input: {
  player?: AnimeWatchPlayerParam | null;
  season?: number | null;
  episode?: number | null;
  translationTitle?: string | null;
  positionSeconds?: number | null;
}): string | null {
  const parts: string[] = [];
  if (input.player === "cvh") parts.push("VideoHUB");
  else if (input.player === "kodik") parts.push("TA");

  if (input.season != null) parts.push(formatWatchShareSeasonLabel(input.season));
  if (input.episode != null) parts.push(`серия ${input.episode}`);
  if (input.translationTitle?.trim()) parts.push(input.translationTitle.trim());
  if (input.positionSeconds != null && input.positionSeconds > 0) {
    parts.push(formatWatchShareTimecode(input.positionSeconds));
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Path + query (+ #player) для og:url по разобранному deep-link. */
export function buildAnimeWatchShareCanonicalPath(
  shikimoriId: number,
  link: AnimeWatchDeepLink,
): string {
  const params = new URLSearchParams();
  if (link.player) params.set(ANIME_WATCH_QUERY.player, link.player);
  if (link.season != null) params.set(ANIME_WATCH_QUERY.season, String(link.season));
  if (link.episode != null) params.set(ANIME_WATCH_QUERY.episode, String(link.episode));
  if (link.translationId != null) {
    params.set(ANIME_WATCH_QUERY.translation, String(link.translationId));
  }
  if (link.positionSeconds != null && link.positionSeconds > 0) {
    params.set(ANIME_WATCH_QUERY.time, String(Math.floor(link.positionSeconds)));
  }
  if (link.disableHistorySave) params.set(ANIME_WATCH_QUERY.nosave, "1");
  const query = params.toString();
  return `/anime/${shikimoriId}${query ? `?${query}` : ""}#player`;
}

export function buildAnimeWatchShareUrl(input: AnimeWatchShareInput): string {
  const url = new URL(`/anime/${input.shikimoriId}`, input.origin);
  if (input.preserveSearch) {
    const preserved = new URLSearchParams(
      input.preserveSearch.startsWith("?") ? input.preserveSearch.slice(1) : input.preserveSearch,
    );
    for (const key of Object.values(ANIME_WATCH_QUERY)) {
      preserved.delete(key);
    }
    preserved.delete("watchRoom");
    for (const [key, value] of preserved) {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set(ANIME_WATCH_QUERY.player, input.player);
  url.searchParams.set(ANIME_WATCH_QUERY.season, String(Math.trunc(input.season)));
  url.searchParams.set(ANIME_WATCH_QUERY.episode, String(Math.trunc(input.episode)));
  if (input.translationId != null && Number.isFinite(input.translationId)) {
    url.searchParams.set(ANIME_WATCH_QUERY.translation, String(Math.trunc(input.translationId)));
  }
  const seconds = Math.max(0, Math.floor(input.positionSeconds ?? 0));
  if (seconds > 0) {
    url.searchParams.set(ANIME_WATCH_QUERY.time, String(seconds));
  }
  if (input.disableHistorySave !== false) {
    url.searchParams.set(ANIME_WATCH_QUERY.nosave, "1");
  }
  url.hash = "player";
  return url.toString();
}
