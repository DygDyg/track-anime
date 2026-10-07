import { isShikimoriMissingImage } from "@/lib/shikimori/client";

export type CoverCacheSize = "full" | "thumb";

export type PosterResolveOptions = {
  shikimoriId?: number | null;
  size?: CoverCacheSize;
  /** Cache-bust query for /api/cover after force refresh */
  cacheBust?: string | number | null;
};

/** URL прокси-кэша. Прямая ссылка на источник не передаётся — сервер берёт её только при промахе/устаревании. */
export function coverCacheUrl(
  shikimoriId: number,
  size: CoverCacheSize = "full",
  cacheBust?: string | number | null,
): string {
  const base =
    size === "thumb" ? `/api/cover?id=${shikimoriId}&size=thumb` : `/api/cover?id=${shikimoriId}`;
  if (cacheBust == null || cacheBust === "") return base;
  return `${base}&_=${encodeURIComponent(String(cacheBust))}`;
}

export function resolvePosterUrl(
  url: string | null | undefined,
  options?: PosterResolveOptions,
): string | null {
  if (options?.shikimoriId) {
    return coverCacheUrl(options.shikimoriId, options.size ?? "thumb", options.cacheBust);
  }
  if (!url || isShikimoriMissingImage(url)) return null;
  return url;
}

export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || isShikimoriMissingImage(url)) return false;
  return url.trim().length > 0;
}

export function shouldUpgradeImageToHttps(url: string): boolean {
  return !/world-art\.ru/i.test(url);
}

export function normalizeDirectImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!shouldUpgradeImageToHttps(trimmed)) return trimmed;
  return trimmed.replace(/^http:\/\//i, "https://");
}

export function preferOriginalShikimoriImageUrl(url: string | null | undefined): string | null {
  if (!isValidImageUrl(url)) return null;

  const normalized = normalizeDirectImageUrl(url!);

  if (/\/system\/animes\/(?:preview|x96|x48)\//i.test(normalized)) {
    return normalized.replace(/\/system\/animes\/(?:preview|x96|x48)\//i, "/system/animes/original/");
  }

  if (/\/(?:preview|x96|x48)\//i.test(normalized) && /shikimori\./i.test(normalized)) {
    return normalized.replace(/\/(?:preview|x96|x48)\//i, "/original/");
  }

  return normalized;
}

/** Для карточек — Shikimori preview вместо original, если возможно. */
export function pickThumbDirectUrl(url: string): string {
  const normalized = normalizeDirectImageUrl(url);

  if (/\/system\/animes\/original\//i.test(normalized)) {
    return normalized.replace(/\/system\/animes\/original\//i, "/system/animes/preview/");
  }

  if (/\/original\//i.test(normalized) && !/\/preview\//i.test(normalized)) {
    return normalized.replace(/\/original\//i, "/preview/");
  }

  return normalized;
}

export function resolveDirectPosterUrl(
  url: string | null | undefined,
  size: CoverCacheSize = "thumb",
): string | null {
  if (!isValidImageUrl(url)) return null;
  const normalized = normalizeDirectImageUrl(url!);
  if (size === "thumb") return pickThumbDirectUrl(normalized);
  return normalized;
}

export type PosterDisplayAttempt = "poster" | "direct" | "fallback";

export function getInitialPosterDisplayAttempt(
  posterUrl: string | null | undefined,
  fallbackUrl: string | null | undefined,
  options?: PosterResolveOptions,
): PosterDisplayAttempt {
  const shikimoriId = options?.shikimoriId;

  // С id всегда идём в /api/cover — иначе full на странице тайтла берёт прямой
  // posterUrl (часто устаревший анонс), а lightbox уже обновлённый cover-cache.
  if (shikimoriId) return "poster";
  if (isValidImageUrl(posterUrl)) return "direct";
  if (isValidImageUrl(fallbackUrl)) return "fallback";
  return "poster";
}

export function resolvePosterDisplayUrl(
  attempt: PosterDisplayAttempt,
  posterUrl: string | null | undefined,
  fallbackUrl: string | null | undefined,
  options?: PosterResolveOptions,
): string | null {
  const size = options?.size ?? "thumb";

  if (attempt === "fallback") {
    return resolveDirectPosterUrl(fallbackUrl, size);
  }

  if (attempt === "direct") {
    return resolveDirectPosterUrl(posterUrl, size);
  }

  if (options?.shikimoriId) {
    return coverCacheUrl(options.shikimoriId, size, options.cacheBust);
  }

  if (isValidImageUrl(posterUrl)) {
    return resolveDirectPosterUrl(posterUrl, size);
  }

  if (isValidImageUrl(fallbackUrl)) {
    return resolveDirectPosterUrl(fallbackUrl, size);
  }

  return null;
}
