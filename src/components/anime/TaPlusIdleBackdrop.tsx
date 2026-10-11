"use client";

import { useEffect, useMemo, useState } from "react";
import { toTaPlusDisplayPreviewUrl } from "@/lib/ta-plus-previews";
import {
  pickTaPlusIdleSlideshowFrames,
  type TaPlusTiles,
} from "@/lib/ta-plus-tiles";

const SLIDE_MS = 4_500;

type Props = {
  /** Full-frame preview URLs (episode screenshots / CDN thumbs). */
  previews?: string[] | null;
  tiles: TaPlusTiles | null;
  loading?: boolean;
  fillViewport?: boolean;
  onPlay: () => void;
  className?: string;
};

export function TaPlusIdleBackdrop({
  previews = null,
  tiles,
  loading = false,
  fillViewport = false,
  onPlay,
  className,
}: Props) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

  const fullFrameSlides = useMemo(() => {
    const urls = (previews ?? [])
      .map((url) => url.trim())
      .filter(Boolean)
      .map(toTaPlusDisplayPreviewUrl)
      .filter((url) => !failedUrls.has(url));
    return urls;
  }, [failedUrls, previews]);

  const tileSlides = useMemo(() => {
    if (fullFrameSlides.length > 0 || !tiles) return [];
    return pickTaPlusIdleSlideshowFrames(tiles, 5).filter((slide) => !failedUrls.has(slide.url));
  }, [failedUrls, fullFrameSlides.length, tiles]);

  const useFullFrame = fullFrameSlides.length > 0;
  const slideCount = useFullFrame ? fullFrameSlides.length : tileSlides.length;

  useEffect(() => {
    setFailedUrls(new Set());
    setSlideIndex(0);
  }, [previews, tiles?.pattern]);

  useEffect(() => {
    setSlideIndex(0);
    if (slideCount <= 1) return;
    const timer = window.setInterval(() => {
      setSlideIndex((value) => (value + 1) % slideCount);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [slideCount, useFullFrame, tiles?.pattern, previews]);

  const activeFull = useFullFrame ? (fullFrameSlides[slideIndex] ?? fullFrameSlides[0] ?? null) : null;
  const activeTile = !useFullFrame ? (tileSlides[slideIndex] ?? tileSlides[0] ?? null) : null;
  const cols = Math.max(1, tiles?.x ?? 1);
  const rows = Math.max(1, tiles?.y ?? 1);

  return (
    <div
      className={[
        "relative flex w-full items-center justify-center overflow-hidden bg-black",
        fillViewport ? "anime-player-shell-viewport h-full max-w-none" : "",
        className ?? "",
      ].join(" ")}
    >
      <div
        className={[
          "kodik-player-beta-frame relative w-full overflow-hidden",
          fillViewport ? "anime-player-viewport-frame h-full max-h-full" : "aspect-video",
        ].join(" ")}
      >
        {activeFull ? (
          <div
            key={`${activeFull}-${slideIndex}`}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
            style={{
              backgroundImage: `url("${activeFull.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
            }}
            aria-hidden
          />
        ) : activeTile && tiles ? (
          <div
            key={`${activeTile.url}-${activeTile.col}-${activeTile.row}-${slideIndex}`}
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              backgroundImage: `url("${activeTile.url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${cols * 100}% ${rows * 100}%`,
              backgroundPosition: `${cols <= 1 ? 0 : (activeTile.col / (cols - 1)) * 100}% ${
                rows <= 1 ? 0 : (activeTile.row / (rows - 1)) * 100
              }%`,
            }}
            aria-hidden
          />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-surface-dim" aria-hidden />
        )}
        {activeFull || activeTile ? (
          <img
            src={activeFull ?? activeTile!.url}
            alt=""
            className="pointer-events-none absolute h-px w-px opacity-0"
            onError={() => {
              const failed = activeFull ?? activeTile!.url;
              setFailedUrls((prev) => {
                const next = new Set(prev);
                next.add(failed);
                return next;
              });
            }}
          />
        ) : null}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/35"
          aria-hidden
        />
        <button
          type="button"
          onClick={onPlay}
          disabled={loading}
          aria-label="Смотреть"
          className={[
            "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-white transition",
            loading
              ? "cursor-wait opacity-70"
              : "hover:scale-110 hover:opacity-95 active:scale-95",
          ].join(" ")}
        >
          {loading ? (
            <span className="block h-14 w-14 animate-spin rounded-full border-[3px] border-white/85 border-r-transparent drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)]" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-20 w-20 fill-current drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)] sm:h-24 sm:w-24"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
