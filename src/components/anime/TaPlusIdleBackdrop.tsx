"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toTaPlusDisplayPreviewUrl } from "@/lib/ta-plus-previews";
import {
  pickTaPlusIdleSlideshowFrames,
  type TaPlusTiles,
} from "@/lib/ta-plus-tiles";

const SLIDE_MS = 5_200;
const VEIL_MS = 520;

type FullSlide = { kind: "full"; url: string };
type TileSlide = { kind: "tile"; url: string; col: number; row: number };
type Slide = FullSlide | TileSlide;

type Props = {
  /** Full-frame preview URLs (episode screenshots / CDN thumbs). */
  previews?: string[] | null;
  tiles: TaPlusTiles | null;
  loading?: boolean;
  fillViewport?: boolean;
  onPlay: () => void;
  className?: string;
};

function cssUrl(url: string): string {
  return `"${url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function slideKey(slide: Slide): string {
  return slide.kind === "full" ? `full:${slide.url}` : `tile:${slide.url}:${slide.col}:${slide.row}`;
}

function SlideLayer({
  slide,
  tiles,
  visible,
  alternateDrift,
}: {
  slide: Slide;
  tiles: TaPlusTiles | null;
  visible: boolean;
  alternateDrift: boolean;
}) {
  const cols = Math.max(1, tiles?.x ?? 1);
  const rows = Math.max(1, tiles?.y ?? 1);
  const tileStyle =
    slide.kind === "tile"
      ? {
          backgroundRepeat: "no-repeat" as const,
          backgroundSize: `${cols * 100}% ${rows * 100}%`,
          backgroundPosition: `${cols <= 1 ? 0 : (slide.col / (cols - 1)) * 100}% ${
            rows <= 1 ? 0 : (slide.row / (rows - 1)) * 100
          }%`,
        }
      : {
          backgroundSize: "cover" as const,
          backgroundPosition: "center" as const,
        };

  return (
    <div
      className={[
        "ta-plus-idle-slide",
        visible ? "ta-plus-idle-slide--in" : "ta-plus-idle-slide--out",
        visible && alternateDrift ? "ta-plus-idle-slide--in-alt" : "",
      ].join(" ")}
      aria-hidden
    >
      <div
        className={[
          "ta-plus-idle-slide__media bg-center",
          slide.kind === "full" ? "bg-cover" : "",
        ].join(" ")}
        style={{
          backgroundImage: `url(${cssUrl(slide.url)})`,
          ...tileStyle,
        }}
      />
    </div>
  );
}

export function TaPlusIdleBackdrop({
  previews = null,
  tiles,
  loading = false,
  fillViewport = false,
  onPlay,
  className,
}: Props) {
  const [readyUrls, setReadyUrls] = useState<Set<string>>(() => new Set());
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [frontSlide, setFrontSlide] = useState<Slide | null>(null);
  const [backSlide, setBackSlide] = useState<Slide | null>(null);
  const [frontVisible, setFrontVisible] = useState(true);
  const [driftAlt, setDriftAlt] = useState(false);
  const [veilOn, setVeilOn] = useState(false);
  const readySlidesRef = useRef<Slide[]>([]);
  const veilTimerRef = useRef<number | null>(null);

  const allSlides = useMemo((): Slide[] => {
    const full = (previews ?? [])
      .map((url) => url.trim())
      .filter(Boolean)
      .map(toTaPlusDisplayPreviewUrl)
      .filter((url) => !failedUrls.has(url))
      .map((url): FullSlide => ({ kind: "full", url }));
    if (full.length > 0) return full;
    if (!tiles) return [];
    return pickTaPlusIdleSlideshowFrames(tiles, 5)
      .filter((slide) => !failedUrls.has(slide.url))
      .map(
        (slide): TileSlide => ({
          kind: "tile",
          url: slide.url,
          col: slide.col,
          row: slide.row,
        }),
      );
  }, [failedUrls, previews, tiles]);

  const preloadUrls = useMemo(() => {
    const unique = new Set<string>();
    for (const slide of allSlides) unique.add(slide.url);
    return [...unique];
  }, [allSlides]);

  const preloadKey = preloadUrls.join("\n");

  useEffect(() => {
    setReadyUrls(new Set());
    setFailedUrls(new Set());
    setActiveKey(null);
    setFrontSlide(null);
    setBackSlide(null);
    setFrontVisible(true);
    setDriftAlt(false);
    setVeilOn(false);
    if (veilTimerRef.current != null) {
      window.clearTimeout(veilTimerRef.current);
      veilTimerRef.current = null;
    }
  }, [preloadKey]);

  useEffect(() => {
    if (preloadUrls.length === 0) return;
    let cancelled = false;
    const images: HTMLImageElement[] = [];

    for (const url of preloadUrls) {
      const img = new Image();
      images.push(img);
      img.decoding = "async";
      img.onload = () => {
        if (cancelled) return;
        setReadyUrls((prev) => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.onerror = () => {
        if (cancelled) return;
        setFailedUrls((prev) => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    }

    return () => {
      cancelled = true;
      for (const img of images) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
    };
  }, [preloadKey, preloadUrls]);

  useEffect(() => {
    return () => {
      if (veilTimerRef.current != null) {
        window.clearTimeout(veilTimerRef.current);
      }
    };
  }, []);

  const readySlides = useMemo(
    () => allSlides.filter((slide) => readyUrls.has(slide.url)),
    [allSlides, readyUrls],
  );
  readySlidesRef.current = readySlides;

  useEffect(() => {
    if (frontSlide || backSlide || readySlides.length === 0) return;
    const first = readySlides[0]!;
    setFrontSlide(first);
    setBackSlide(first);
    setActiveKey(slideKey(first));
    setFrontVisible(true);
  }, [backSlide, frontSlide, readySlides]);

  const canRotate = readySlides.length > 1;
  useEffect(() => {
    if (!canRotate) return;

    const timer = window.setInterval(() => {
      setActiveKey((current) => {
        const ready = readySlidesRef.current;
        if (ready.length <= 1) return current;
        const currentIndex = Math.max(
          0,
          ready.findIndex((slide) => slideKey(slide) === current),
        );
        const next = ready[(currentIndex + 1) % ready.length]!;

        setFrontVisible((frontIsVisible) => {
          if (frontIsVisible) {
            setBackSlide(next);
          } else {
            setFrontSlide(next);
          }
          return !frontIsVisible;
        });
        setDriftAlt((value) => !value);
        setVeilOn(true);
        if (veilTimerRef.current != null) window.clearTimeout(veilTimerRef.current);
        veilTimerRef.current = window.setTimeout(() => {
          setVeilOn(false);
          veilTimerRef.current = null;
        }, VEIL_MS);

        return slideKey(next);
      });
    }, SLIDE_MS);

    return () => window.clearInterval(timer);
  }, [canRotate, preloadKey]);

  const hasSlide = Boolean(frontSlide || backSlide);

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
        {hasSlide ? (
          <>
            {backSlide ? (
              <SlideLayer
                slide={backSlide}
                tiles={tiles}
                visible={!frontVisible}
                alternateDrift={driftAlt}
              />
            ) : null}
            {frontSlide ? (
              <SlideLayer
                slide={frontSlide}
                tiles={tiles}
                visible={frontVisible}
                alternateDrift={driftAlt}
              />
            ) : null}
            <div
              className={["ta-plus-idle-veil", veilOn ? "ta-plus-idle-veil--on" : ""].join(" ")}
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 animate-pulse bg-surface-dim" aria-hidden />
        )}
        <div
          className="absolute inset-0 z-[3] bg-gradient-to-t from-black/70 via-black/20 to-black/35"
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
