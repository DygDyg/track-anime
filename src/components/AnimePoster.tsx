"use client";

import { useState } from "react";
import { POSTER_PLACEHOLDER, resolvePosterUrl, type CoverCacheSize } from "@/lib/poster";

type Props = {
  src: string | null | undefined;
  shikimoriId?: number | null;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** full — страница тайтла; thumb — карточки и списки (меньше ряби при даунскейле) */
  size?: CoverCacheSize;
};

export function AnimePoster({
  src,
  shikimoriId,
  alt,
  className,
  loading = "lazy",
  size = "thumb",
}: Props) {
  const [failed, setFailed] = useState(false);
  const resolved = failed ? POSTER_PLACEHOLDER : resolvePosterUrl(src, { shikimoriId, size });

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}
