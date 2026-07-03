"use client";

import { useMemo, useState } from "react";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimePageListBadge } from "@/components/anime/AnimePageListBadge";
import { ImageLightbox } from "@/components/anime/ImageLightbox";
import { coverCacheUrl, isValidImageUrl, normalizeDirectImageUrl } from "@/lib/poster";

type Props = {
  shikimoriId: number;
  posterUrl: string | null;
  fallbackSrc?: string | null;
  title: string;
};

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4M11 8v6M8 11h6" strokeLinecap="round" />
    </svg>
  );
}

export function AnimePosterCover({ shikimoriId, posterUrl, fallbackSrc, title }: Props) {
  const [open, setOpen] = useState(false);

  const lightboxSrc = useMemo(() => {
    if (shikimoriId) return coverCacheUrl(shikimoriId, "full");
    if (isValidImageUrl(posterUrl)) return normalizeDirectImageUrl(posterUrl!);
    if (isValidImageUrl(fallbackSrc)) return normalizeDirectImageUrl(fallbackSrc!);
    return null;
  }, [shikimoriId, posterUrl, fallbackSrc]);

  return (
    <>
      <button
        type="button"
        onClick={() => lightboxSrc && setOpen(true)}
        disabled={!lightboxSrc}
        className="anime-page-mobile-fullbleed group relative block w-full overflow-hidden border-b border-border bg-card shadow-md sm:max-w-none sm:rounded-xl sm:border sm:border-border disabled:cursor-default"
        aria-label={lightboxSrc ? `Увеличить обложку «${title}»` : undefined}
      >
        <AnimePoster
          src={posterUrl}
          fallbackSrc={fallbackSrc}
          shikimoriId={shikimoriId}
          alt={title}
          loading="eager"
          size="thumb"
          className="aspect-[3/4] w-full object-cover transition duration-300 group-hover:scale-[1.02] group-disabled:group-hover:scale-100 sm:max-h-none"
        />
        {lightboxSrc ? (
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white opacity-90 shadow-lg backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-black/70 sm:bottom-2 sm:right-2">
            <ZoomIcon />
          </span>
        ) : null}
        <AnimePageListBadge
          shikimoriId={shikimoriId}
          size="md"
          className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] sm:left-2 sm:top-2"
        />
      </button>

      {lightboxSrc ? (
        <ImageLightbox
          open={open}
          onClose={() => setOpen(false)}
          items={[{ src: lightboxSrc, alt: title }]}
        />
      ) : null}
    </>
  );
}
