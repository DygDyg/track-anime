/** Query param for emergency iframe remount — bypasses HTTP cache of the embed document. */
export const KODIK_PLAYER_RELOAD_QUERY = "ta_reload";

/** URL для iframe Kodik (//kodikplayer.com/... → https:) */
export function toKodikPlayerEmbedUrl(link: string): string {
  if (link.startsWith("//")) return `https:${link}`;
  return link;
}

/**
 * Client-only cache-bust for emergency player remount.
 * Does not mutate stored `playerLink` in DB — call with a copy of the embed URL.
 */
export function withKodikPlayerCacheBust(link: string, token: string | number): string {
  const absolute = toKodikPlayerEmbedUrl(link);
  try {
    const url = new URL(absolute);
    url.searchParams.set(KODIK_PLAYER_RELOAD_QUERY, String(token));
    return url.href;
  } catch {
    const trimmed = absolute.replace(new RegExp(`[?&]${KODIK_PLAYER_RELOAD_QUERY}=[^&#]*`, "g"), "");
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}${KODIK_PLAYER_RELOAD_QUERY}=${encodeURIComponent(String(token))}`;
  }
}

/** Kodik season/seria embed — без селектора сезонов; `change_episode` без `season`. */
export function isSeasonScopedKodikPlayerLink(link: string): boolean {
  try {
    const path = new URL(toKodikPlayerEmbedUrl(link)).pathname;
    return /\/season\/|\/seria\//i.test(path);
  } catch {
    return /kodikplayer\.com\/(?:season|seria)\//i.test(link);
  }
}

/** Одна серия (`/seria/`) — эпизод зашит в URL, `change_episode` не нужен. */
export function isSingleEpisodeKodikPlayerLink(link: string): boolean {
  try {
    return /\/seria\//i.test(new URL(toKodikPlayerEmbedUrl(link)).pathname);
  } catch {
    return /kodikplayer\.com\/seria\//i.test(link);
  }
}

export function normalizeKodikPlayerLinkForCompare(link: string): string {
  try {
    const url = new URL(toKodikPlayerEmbedUrl(link));
    url.searchParams.delete(KODIK_PLAYER_RELOAD_QUERY);
    return url.href;
  } catch {
    return link.replace(new RegExp(`[?&]${KODIK_PLAYER_RELOAD_QUERY}=[^&#]*`, "g"), "");
  }
}

/** Эпизод → сезон → serial material. */
export function resolveKodikEpisodePlayerLink(
  materialLink: string,
  seasonPlayerLink: string | null | undefined,
  episodePlayerLink: string | null | undefined,
): string {
  if (episodePlayerLink) return episodePlayerLink;
  if (seasonPlayerLink) return seasonPlayerLink;
  return materialLink;
}

export type KodikPlayerLinkMode = "serial" | "season" | "single";

export function detectKodikPlayerLinkMode(src: string): KodikPlayerLinkMode {
  if (isSingleEpisodeKodikPlayerLink(src)) return "single";
  if (isSeasonScopedKodikPlayerLink(src)) return "season";
  return "serial";
}

function kodikPlayerLinksEqual(left: string, right: string): boolean {
  return normalizeKodikPlayerLinkForCompare(left) === normalizeKodikPlayerLinkForCompare(right);
}

/**
 * Prefer per-episode `/seria/` remount when a scoped link is available.
 * Same-season switches without `/seria/` stay on serial/season (`change_episode`).
 * Leaving a locked `/seria/` without a new one remounts back to the material serial.
 * Season/specials trees still remount onto season embeds when needed.
 */
export function resolveKodikPlayerEpisodeSwitch(input: {
  currentSrc: string;
  materialLink: string;
  scopedPlayerLink?: string | null;
  currentSeasonNumber: number;
  targetSeasonNumber: number;
}): { src: string; remount: boolean } {
  const currentSrc = input.currentSrc.trim() || input.materialLink;
  const scoped = input.scopedPlayerLink?.trim() || null;
  const currentMode = detectKodikPlayerLinkMode(currentSrc);
  const seasonChanged = input.targetSeasonNumber !== input.currentSeasonNumber;

  const withRemount = (src: string): { src: string; remount: boolean } => ({
    src,
    remount: !kodikPlayerLinksEqual(src, currentSrc),
  });

  // Locked episode URL — always remount when the embed actually changes.
  if (scoped && isSingleEpisodeKodikPlayerLink(scoped)) {
    return withRemount(scoped);
  }

  if (seasonChanged) {
    if (input.targetSeasonNumber === 0 && scoped) {
      return withRemount(scoped);
    }
    const scopedMode = scoped ? detectKodikPlayerLinkMode(scoped) : "serial";
    if (scoped && scopedMode === "season") {
      return withRemount(scoped);
    }
    return withRemount(input.materialLink);
  }

  // Same season, no /seria/: change_episode on serial/season iframe.
  if (currentMode === "serial" || currentMode === "season") {
    if (scoped && detectKodikPlayerLinkMode(scoped) === "season") {
      return withRemount(scoped);
    }
    return { src: currentSrc, remount: false };
  }

  // Currently on /seria/ but next episode has no seria link — unlock via material serial.
  if (currentMode === "single") {
    return withRemount(input.materialLink);
  }

  if (scoped && !kodikPlayerLinksEqual(scoped, currentSrc)) {
    if (detectKodikPlayerLinkMode(scoped) === "season" || input.currentSeasonNumber === 0) {
      return withRemount(scoped);
    }
    return withRemount(input.materialLink);
  }

  if (input.currentSeasonNumber !== 0 && !kodikPlayerLinksEqual(input.materialLink, currentSrc)) {
    return withRemount(input.materialLink);
  }

  return { src: currentSrc, remount: false };
}
