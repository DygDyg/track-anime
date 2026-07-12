"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/anime/ImageLightbox";
import { buildCachedImageUrl } from "@/lib/image-cache-url";

type Props = {
  title: string;
  screenshots: string[];
};

function SpoilerChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 -rotate-90 text-muted transition-transform duration-200 group-open:rotate-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function AnimeScreenshotsSpoiler({ title, screenshots }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (screenshots.length === 0) return null;

  const cachedScreenshots = screenshots.map((src) => buildCachedImageUrl("screenshot", src) ?? src);
  const items = cachedScreenshots.map((src, index) => ({
    src,
    alt: `Скриншот ${index + 1} из «${title}»`,
  }));

  return (
    <>
      <details className="home-history-section group relative rounded-xl border border-border">
        <div
          aria-hidden
          className="site-header-bg pointer-events-none absolute inset-0 overflow-hidden rounded-xl backdrop-blur-lg backdrop-saturate-150"
        />
        <summary className="site-header-text relative flex h-14 cursor-pointer list-none items-center gap-2 bg-card px-4 marker:content-none group-open:border-b group-open:border-border group-open:bg-transparent sm:h-16 sm:px-5 [&::-webkit-details-marker]:hidden">
          <SpoilerChevron />
          <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
            Скриншоты
          </span>
          <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">({screenshots.length})</span>
        </summary>
        <div className="site-header-text relative bg-card/95 px-4 py-3 backdrop-blur-lg backdrop-saturate-150 sm:px-5 sm:py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {cachedScreenshots.map((src, index) => (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() => {
                  setLightboxIndex(index);
                  setLightboxOpen(true);
                }}
                className="group/shot relative overflow-hidden rounded-lg border border-border bg-surface-dim text-left transition hover:border-accent/40 hover:shadow-md hover:shadow-accent/10"
                aria-label={`Открыть скриншот ${index + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-video w-full object-cover transition duration-300 group-hover/shot:scale-[1.03]"
                />
              </button>
            ))}
          </div>
        </div>
      </details>

      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        items={items}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
