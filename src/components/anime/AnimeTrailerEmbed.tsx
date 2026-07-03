"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AnimePoster } from "@/components/AnimePoster";
import {
  sendYoutubePlayerCommand,
  startYoutubePlayerListening,
  subscribeYoutubePlayerEvents,
  youtubeTrailerEmbedUrl,
} from "@/lib/shikimori/trailer";

const LISTEN_RETRY_MS = [0, 250, 750, 1500] as const;
const PANEL_ROW_SELECTOR = ".anime-page-hero-row";

type LayoutMetrics = {
  offsetLeft: number;
  rowWidth: number;
  compactWidth: number;
};

type Props = {
  shikimoriId: number;
  youtubeId: string;
  posterUrl: string | null;
  title: string;
  className?: string;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72L19 12 8 5.14z" />
    </svg>
  );
}

export function AnimeTrailerEmbed({
  shikimoriId,
  youtubeId,
  posterUrl,
  title,
  className = "",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listenRetryTimers = useRef<number[]>([]);

  const [active, setActive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [embedOrigin, setEmbedOrigin] = useState("");
  const [layout, setLayout] = useState<LayoutMetrics | null>(null);

  useEffect(() => {
    setEmbedOrigin(window.location.origin);
  }, []);

  const measureLayout = () => {
    const root = rootRef.current;
    const row = root?.closest(PANEL_ROW_SELECTOR);
    if (!root || !row) return;

    const rootRect = root.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    setLayout({
      offsetLeft: rootRect.left - rowRect.left,
      rowWidth: rowRect.width,
      compactWidth: rootRect.width,
    });
  };

  useLayoutEffect(() => {
    measureLayout();
    window.addEventListener("resize", measureLayout);
    return () => window.removeEventListener("resize", measureLayout);
  }, [active, expanded]);

  const clearListenRetryTimers = () => {
    for (const timerId of listenRetryTimers.current) {
      window.clearTimeout(timerId);
    }
    listenRetryTimers.current = [];
  };

  const beginYoutubePlayerListening = (iframe: HTMLIFrameElement) => {
    clearListenRetryTimers();
    for (const delay of LISTEN_RETRY_MS) {
      const timerId = window.setTimeout(() => startYoutubePlayerListening(iframe), delay);
      listenRetryTimers.current.push(timerId);
    }
  };

  const handlePlayClick = () => {
    measureLayout();
    setActive(true);
    setExpanded(true);
  };

  useEffect(() => {
    if (!active) return;

    const unsubscribe = subscribeYoutubePlayerEvents({
      onPlaying: () => setExpanded(true),
      onPaused: () => setExpanded(false),
      onEnded: () => {
        setExpanded(false);
        setActive(false);
      },
    });

    return () => {
      unsubscribe();
      clearListenRetryTimers();
    };
  }, [active]);

  const handleIframeLoad = (iframe: HTMLIFrameElement) => {
    beginYoutubePlayerListening(iframe);
    sendYoutubePlayerCommand(iframe, "playVideo");
  };

  const embedUrl =
    active && embedOrigin
      ? youtubeTrailerEmbedUrl(youtubeId, {
          muted: false,
          controls: true,
          origin: embedOrigin,
        })
      : null;

  const expandVars =
    active && layout
      ? ({
          "--trailer-expand-width": `${layout.rowWidth}px`,
          "--trailer-expand-offset": `${-layout.offsetLeft}px`,
          "--trailer-compact-width": `${layout.compactWidth}px`,
        } as CSSProperties)
      : undefined;

  return (
    <div ref={rootRef} className={["mt-3", className].filter(Boolean).join(" ")}>
      <div
        style={expandVars}
        className={[
          "anime-trailer-shell relative w-full overflow-hidden rounded-none border-y border-border bg-black shadow-sm transition-[width,margin,box-shadow,border-color] duration-500 ease-out sm:rounded-lg sm:border",
          active && expanded ? "anime-trailer-shell--expanded" : "",
          active && !expanded ? "anime-trailer-shell--compact-active" : "",
          active && expanded ? "border-accent/30 shadow-2xl shadow-black/60 sm:rounded-lg" : "",
        ].join(" ")}
      >
        {!active ? (
          <button
            type="button"
            onClick={handlePlayClick}
            className="group relative block w-full text-left"
            aria-label={`Смотреть трейлер «${title}»`}
          >
            <div className="relative aspect-video w-full bg-surface-dim">
              <AnimePoster
                src={posterUrl}
                shikimoriId={shikimoriId}
                alt=""
                size="thumb"
                className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
              />
              <div className="absolute inset-0 bg-black/35 transition group-hover:bg-black/25" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur-sm transition group-hover:scale-105 group-hover:border-white/35 group-hover:bg-black/70">
                  <PlayIcon />
                </span>
              </div>
            </div>
            <p className="bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted">Трейлер</p>
          </button>
        ) : (
          <>
            <div className="relative aspect-video w-full">
              {embedUrl ? (
                <iframe
                  id={`anime-trailer-${youtubeId}`}
                  src={embedUrl}
                  title={`Трейлер «${title}»`}
                  className="absolute inset-0 h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  onLoad={(event) => handleIframeLoad(event.currentTarget)}
                />
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 bg-card px-2.5 py-1.5">
              <p className="text-[11px] font-medium text-muted">Трейлер</p>
              <a
                href={`https://www.youtube.com/watch?v=${youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[11px] text-accent transition hover:underline"
              >
                YouTube
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
