/** Типы Shikimori, которые считаем полноценным аниме для календаря анонсов. */
export const SHIKIMORI_FULL_ANIME_KINDS = [
  "tv",
  "tv_13",
  "tv_24",
  "tv_48",
  "movie",
  "ova",
  "ona",
] as const;

export type ShikimoriFullAnimeKind = (typeof SHIKIMORI_FULL_ANIME_KINDS)[number];

const FULL_ANIME_KIND_SET = new Set<string>(SHIKIMORI_FULL_ANIME_KINDS);

export function isShikimoriFullAnimeKind(kind: string | null | undefined): kind is ShikimoriFullAnimeKind {
  if (!kind) return false;
  return FULL_ANIME_KIND_SET.has(kind);
}

export const SHIKIMORI_FULL_ANIME_KINDS_QUERY = SHIKIMORI_FULL_ANIME_KINDS.join(",");
