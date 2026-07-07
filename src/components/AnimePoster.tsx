"use client";

import { useCallback, useEffect, useState } from "react";
import { TitleCover } from "@/components/TitleCover";
import {
  getInitialPosterDisplayAttempt,
  isValidImageUrl,
  resolvePosterDisplayUrl,
  type CoverCacheSize,
  type PosterDisplayAttempt,
} from "@/lib/poster";

type Props = {
  src: string | null | undefined;
  fallbackSrc?: string | null | undefined;
  shikimoriId?: number | null;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** full — страница тайтла; thumb — карточки и списки */
  size?: CoverCacheSize;
};

function nextPosterAttempt(
  current: PosterDisplayAttempt,
  posterUrl: string | null | undefined,
  fallbackUrl: string | null | undefined,
): PosterDisplayAttempt | null {
  if (current === "poster") {
    if (isValidImageUrl(posterUrl)) return "direct";
    if (isValidImageUrl(fallbackUrl)) return "fallback";
    return null;
  }

  if (current === "direct") {
    if (isValidImageUrl(fallbackUrl)) return "fallback";
    return null;
  }

  return null;
}

export function AnimePoster({
  src,
  fallbackSrc,
  shikimoriId,
  alt,
  className = "",
  loading = "lazy",
  size = "thumb",
}: Props) {
  const [attempt, setAttempt] = useState<PosterDisplayAttempt>(() =>
    getInitialPosterDisplayAttempt(src, fallbackSrc, { shikimoriId, size }),
  );
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setAttempt(getInitialPosterDisplayAttempt(src, fallbackSrc, { shikimoriId, size }));
    setExhausted(false);
  }, [src, fallbackSrc, shikimoriId, size]);

  const imageUrl = exhausted
    ? null
    : resolvePosterDisplayUrl(attempt, src, fallbackSrc, { shikimoriId, size });

  const handleError = useCallback(() => {
    setAttempt((current) => {
      const next = nextPosterAttempt(current, src, fallbackSrc);
      if (next) return next;
      setExhausted(true);
      return current;
    });
  }, [src, fallbackSrc]);

  if (!imageUrl) {
    return (
      <TitleCover
        title={alt.trim() || "?"}
        className={className}
        compact={size === "thumb"}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={alt}
      loading={loading}
      decoding="async"
      width={size === "thumb" ? 320 : undefined}
      height={size === "thumb" ? 427 : undefined}
      className={[className, size === "thumb" ? "anime-poster-thumb" : ""].filter(Boolean).join(" ")}
      onError={handleError}
    />
  );
}
