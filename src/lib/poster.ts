import { isShikimoriMissingImage } from "@/lib/shikimori/client";

export const POSTER_PLACEHOLDER = "/poster-placeholder.webp";

export type CoverCacheSize = "full" | "thumb";

export type PosterResolveOptions = {
  shikimoriId?: number | null;
  size?: CoverCacheSize;
};

/** URL прокси-кэша. Прямая ссылка на источник не передаётся — сервер берёт её только при промахе/устаревании. */
export function coverCacheUrl(shikimoriId: number, size: CoverCacheSize = "full"): string {
  if (size === "thumb") {
    return `/api/cover?id=${shikimoriId}&size=thumb`;
  }
  return `/api/cover?id=${shikimoriId}`;
}

export function resolvePosterUrl(
  url: string | null | undefined,
  options?: PosterResolveOptions,
): string {
  if (options?.shikimoriId) {
    return coverCacheUrl(options.shikimoriId, options.size ?? "thumb");
  }
  if (!url || isShikimoriMissingImage(url)) return POSTER_PLACEHOLDER;
  return url;
}
