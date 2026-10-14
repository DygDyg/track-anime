"use client";

import { useEffect, useRef, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import { buildCachedImageUrl } from "@/lib/image-cache-url";
import type { AnimePageDto } from "@/lib/anime-page";
import { searchFieldParamName } from "@/lib/search-fields";

/** Client budget — if /api/image-cache hangs, fall back to studio name. */
const STUDIO_LOGO_LOAD_TIMEOUT_MS = 12_000;

function buildStudioSearchHref(studioName: string): string {
  const params = new URLSearchParams();
  params.set("tab", "advanced");
  params.set(searchFieldParamName("studio"), studioName);
  return `/search?${params.toString()}`;
}

function StudioLogo({ studio }: { studio: AnimePageDto["studios"][number] }) {
  const imageUrl = buildCachedImageUrl("studio", studio.imageUrl);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoading, setImgLoading] = useState(Boolean(imageUrl));
  const showImage = Boolean(imageUrl) && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
    setImgLoading(Boolean(imageUrl));
  }, [imageUrl]);

  // Disk/memory cache often completes before onLoad is attached.
  useEffect(() => {
    if (!imageUrl) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setImgLoading(false);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (!showImage || !imgLoading) return;
    const timer = window.setTimeout(() => {
      const img = imgRef.current;
      if (img?.complete && img.naturalWidth > 0) {
        setImgLoading(false);
        return;
      }
      setImgFailed(true);
      setImgLoading(false);
    }, STUDIO_LOGO_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [showImage, imgLoading]);

  return (
    <NavLink
      href={buildStudioSearchHref(studio.name)}
      title={studio.name}
      // Prefetch hits nginx /search rate limit (429) and starves image-cache requests.
      prefetch={false}
      className="relative inline-flex h-10 min-w-[3.25rem] max-w-[6.5rem] shrink-0 items-center justify-center rounded-lg border border-border bg-background/90 px-2.5 py-1.5 transition hover:border-accent/40 hover:bg-surface-dim"
    >
      {showImage && imgLoading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner size="xs" />
        </span>
      ) : null}
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={imageUrl!}
          alt={studio.name}
          loading="lazy"
          decoding="async"
          {...EXTERNAL_IMG_ATTRS}
          className={[
            "max-h-7 w-auto max-w-full object-contain",
            imgLoading ? "opacity-0" : "opacity-100",
          ].join(" ")}
          onLoad={() => setImgLoading(false)}
          onError={() => {
            setImgFailed(true);
            setImgLoading(false);
          }}
        />
      ) : (
        <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-muted">
          {studio.name}
        </span>
      )}
    </NavLink>
  );
}

export function AnimeStudioLogos({ studios }: { studios: AnimePageDto["studios"] }) {
  if (studios.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      {studios.map((studio) => (
        <StudioLogo key={studio.id} studio={studio} />
      ))}
    </span>
  );
}
