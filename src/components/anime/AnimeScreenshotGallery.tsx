"use client";

import { useEffect, useState } from "react";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import { buildCachedImageUrl } from "@/lib/image-cache-url";
import { ImageLightbox } from "@/components/anime/ImageLightbox";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Props = {
  title: string;
  screenshots: string[];
  className?: string;
};

/** Client budget — pending /api/image-cache must not spin forever. */
const SCREENSHOT_LOAD_TIMEOUT_MS = 12_000;

export function AnimeScreenshotGallery({ title, screenshots, className = "" }: Props) {
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
      <div className={className}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Скриншоты <span className="font-normal normal-case">({screenshots.length})</span>
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:thin]">
          {cachedScreenshots.map((src, index) => (
            <ScreenshotThumb
              key={`${src}-${index}`}
              src={src}
              index={index}
              onOpen={() => {
                setLightboxIndex(index);
                setLightboxOpen(true);
              }}
            />
          ))}
        </div>
      </div>

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

function ScreenshotThumb({
  src,
  index,
  onOpen,
}: {
  src: string;
  index: number;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loaded || failed) return;
    const timer = window.setTimeout(() => setFailed(true), SCREENSHOT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, failed]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/shot relative shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-surface-dim text-left transition hover:border-accent/40 hover:shadow-md hover:shadow-accent/10"
      aria-label={`Открыть скриншот ${index + 1}`}
    >
      {!loaded && !failed ? (
        <span className="flex aspect-square w-[4.5rem] items-center justify-center sm:w-20">
          <LoadingSpinner size="sm" />
        </span>
      ) : null}
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          {...EXTERNAL_IMG_ATTRS}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={[
            "aspect-square w-[4.5rem] object-cover transition duration-300 group-hover/shot:scale-[1.03] sm:w-20",
            loaded ? "opacity-100" : "absolute inset-0 opacity-0",
          ].join(" ")}
        />
      ) : (
        <span className="flex aspect-square w-[4.5rem] items-center justify-center bg-surface-dim text-[10px] text-muted sm:w-20">
          Нет превью
        </span>
      )}
    </button>
  );
}
