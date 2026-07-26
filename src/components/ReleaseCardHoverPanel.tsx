"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AnimeLink } from "@/components/AnimeLink";
import { AdminAnimeDebugButton } from "@/components/admin/AdminAnimeDebugButton";
import { AnimeKindInfoLink } from "@/components/AnimeKindInfoLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { FavoriteRewatchBadge } from "@/components/favorites/FavoriteRewatchBadge";
import { GenreInfoLink } from "@/components/GenreInfoLink";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { ReleaseCardQuickActions } from "@/components/ReleaseCardQuickActions";
import { TranslationBadge } from "@/components/TranslationBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { labelKind, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { kindBadgeClass } from "@/lib/anime-kind-theme";
import {
  computeHoverPanelOffsetX,
  computeHoverPortalStyle,
  HOVER_PORTAL_ESTIMATED_HEIGHT,
} from "@/lib/hover-portal-position";
import type { HoverPanelReleaseInput } from "@/lib/hover-panel-release";
import {
  sendYoutubePlayerCommand,
  startYoutubePlayerListening,
  subscribeYoutubePlayerEvents,
  youtubeTrailerEmbedUrl,
} from "@/lib/shikimori/trailer";

const PANEL_WIDTH_PX = 320;
const TRAILER_OVERLAY_FALLBACK_MS = 3500;
const TRAILER_LISTEN_RETRY_MS = [0, 250, 750, 1500] as const;

const trailerIdCache = new Map<number, string | null>();
const trailerFetchInflight = new Map<number, Promise<string | null>>();

async function fetchTrailerYoutubeId(shikimoriId: number): Promise<string | null> {
  if (trailerIdCache.has(shikimoriId)) {
    return trailerIdCache.get(shikimoriId) ?? null;
  }

  const inflight = trailerFetchInflight.get(shikimoriId);
  if (inflight) return inflight;

  const promise = fetch(`/api/anime/${shikimoriId}/trailer`)
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { youtubeId?: string | null };
      return data.youtubeId ?? null;
    })
    .catch(() => null)
    .then((youtubeId) => {
      trailerIdCache.set(shikimoriId, youtubeId);
      return youtubeId;
    })
    .finally(() => {
      trailerFetchInflight.delete(shikimoriId);
    });

  trailerFetchInflight.set(shikimoriId, promise);
  return promise;
}

function stripDescription(text: string | null): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain || null;
}

function ReleaseRewatchBadge({
  shikimoriId,
  readOnly = false,
}: {
  shikimoriId: number;
  readOnly?: boolean;
}) {
  const listInfo = useUserListStatus(shikimoriId);

  return (
    <FavoriteRewatchBadge
      shikimoriId={shikimoriId}
      listStatus={listInfo?.listStatus ?? null}
      rewatches={listInfo?.rewatches ?? 0}
      readOnly={readOnly}
      className="text-[11px]"
    />
  );
}

function ReleaseMetaRow({ release }: { release: HoverPanelReleaseInput }) {
  const kindLabel = labelKind(release.kind);
  const kindClass = kindBadgeClass(release.kind);
  const statusLabel = labelStatus(release.status);
  const statusClass = statusBadgeClass(release.status);
  const catalogEpisodes = "catalogEpisodes" in release ? release.catalogEpisodes : null;
  const episodeLabel =
    release.episodeNumber > 0
      ? `${release.episodeNumber} серия`
      : catalogEpisodes
        ? `${catalogEpisodes} эп.`
        : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {release.score ? <AnimeScoreBadge score={release.score} variant="inline" size="sm" /> : null}
      {episodeLabel ? (
        <span className="font-semibold tabular-nums text-foreground">{episodeLabel}</span>
      ) : null}
      {kindLabel && kindClass ? (
        <>
          <span className="text-muted/70">·</span>
          <AnimeKindInfoLink kind={release.kind} className={kindClass}>
            {kindLabel}
          </AnimeKindInfoLink>
        </>
      ) : null}
      {statusLabel && statusClass ? (
        <>
          <span className="text-muted/70">·</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusClass}`}>
            {statusLabel}
          </span>
        </>
      ) : null}
    </div>
  );
}

function ReleaseGenresRow({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null;

  return (
    <p className="text-xs leading-relaxed">
      <span className="text-muted">Жанры: </span>
      {genres.slice(0, 6).map((genre, index) => (
        <span key={genre}>
          {index > 0 ? ", " : null}
          <GenreInfoLink genre={genre} className="font-medium text-accent transition hover:underline">
            {genre}
          </GenreInfoLink>
        </span>
      ))}
    </p>
  );
}

export { PANEL_WIDTH_PX };
export { computeHoverPanelOffsetX } from "@/lib/hover-portal-position";

function TrailerSpeakerIcon({ muted, className = "h-5 w-5" }: { muted: boolean; className?: string }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 0 1 0 7.072M12 6.5 8.5 9H6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5L12 17.5V6.5z" />
        <path strokeLinecap="round" d="m16 9 5 5M21 9l-5 5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 0 1 0 7.072M12 6.5 8.5 9H6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5L12 17.5V6.5z" />
    </svg>
  );
}

function TrailerPreviewImage({
  previewUrl,
  release,
  className,
}: {
  previewUrl: string | null;
  release: HoverPanelReleaseInput;
  className?: string;
}) {
  if (previewUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" className={className} loading="lazy" decoding="async" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-card to-transparent" />
      </>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <AnimePoster
        src={release.posterUrl}
        fallbackSrc={release.screenshotUrl}
        shikimoriId={release.shikimoriId}
        alt={release.animeTitle}
        className="max-h-full max-w-[40%] rounded-md object-contain shadow-lg"
      />
    </div>
  );
}

type Props = {
  release: HoverPanelReleaseInput;
  visible: boolean;
  previewUrl: string | null;
  animeHref: string | null;
  trailerEnabled: boolean;
  trailerDelaySec: number;
  /** Рендер в portal поверх overflow-контейнеров (блок истории на главной) */
  portal?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
  panelOffsetX?: number;
  panelRef?: RefObject<HTMLDivElement | null>;
  onDeleteFromHistory?: () => void | Promise<void>;
  deletingFromHistory?: boolean;
  readOnly?: boolean;
};

export function ReleaseCardHoverPanel({
  release,
  visible,
  previewUrl,
  animeHref,
  trailerEnabled,
  trailerDelaySec,
  portal = false,
  anchorRef,
  panelOffsetX = 0,
  panelRef,
  onDeleteFromHistory,
  deletingFromHistory = false,
  readOnly = false,
}: Props) {
  const description = stripDescription(release.description);
  const watchHref = animeHref ? `${animeHref}#player` : release.playerLink ?? "#";
  const hoverStartedAtRef = useRef(0);
  const trailerIframeRef = useRef<HTMLIFrameElement>(null);
  const overlayFallbackTimerRef = useRef<number | undefined>(undefined);
  const listenRetryTimersRef = useRef<number[]>([]);
  const [trailerYoutubeId, setTrailerYoutubeId] = useState<string | null>(null);
  const [trailerFetching, setTrailerFetching] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerProgress, setTrailerProgress] = useState(0);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [trailerVideoStarted, setTrailerVideoStarted] = useState(false);
  const [embedOrigin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [portalMounted, setPortalMounted] = useState(false);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!portal || !visible || !anchorRef?.current) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const panelHeight = panelRef?.current?.scrollHeight ?? HOVER_PORTAL_ESTIMATED_HEIGHT;
      setPortalStyle(
        computeHoverPortalStyle(
          anchor.getBoundingClientRect(),
          PANEL_WIDTH_PX,
          panelOffsetX,
          panelHeight,
        ),
      );
    };

    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [portal, visible, anchorRef, panelOffsetX, panelRef, release.animeTitle]);

  const trailerDelayMs = trailerDelaySec * 1000;

  const markTrailerVideoStarted = () => {
    setTrailerVideoStarted(true);
  };

  const clearOverlayFallbackTimer = () => {
    if (overlayFallbackTimerRef.current !== undefined) {
      window.clearTimeout(overlayFallbackTimerRef.current);
      overlayFallbackTimerRef.current = undefined;
    }
  };

  const clearListenRetryTimers = () => {
    for (const timer of listenRetryTimersRef.current) {
      window.clearTimeout(timer);
    }
    listenRetryTimersRef.current = [];
  };

  const scheduleOverlayFallback = () => {
    clearOverlayFallbackTimer();
    overlayFallbackTimerRef.current = window.setTimeout(
      markTrailerVideoStarted,
      TRAILER_OVERLAY_FALLBACK_MS,
    );
  };

  const beginYoutubePlayerListening = (iframe: HTMLIFrameElement) => {
    clearListenRetryTimers();
    for (const delay of TRAILER_LISTEN_RETRY_MS) {
      const timer = window.setTimeout(() => {
        startYoutubePlayerListening(iframe);
        sendYoutubePlayerCommand(iframe, "playVideo");
      }, delay);
      listenRetryTimersRef.current.push(timer);
    }
  };

  useEffect(() => {
    if (!visible || !release.shikimoriId || !trailerEnabled) {
      setShowTrailer(false);
      setTrailerYoutubeId(null);
      setTrailerProgress(0);
      setTrailerMuted(true);
      setTrailerVideoStarted(false);
      return;
    }

    let cancelled = false;
    const shikimoriId = release.shikimoriId;
    hoverStartedAtRef.current = Date.now();

    setShowTrailer(false);
    setTrailerYoutubeId(null);
    setTrailerProgress(0);
    setTrailerMuted(true);
    setTrailerVideoStarted(false);
    setTrailerFetching(true);

    void fetchTrailerYoutubeId(shikimoriId)
      .then((youtubeId) => {
        if (cancelled) return;
        setTrailerYoutubeId(youtubeId);
      })
      .finally(() => {
        if (!cancelled) setTrailerFetching(false);
      });

    return () => {
      cancelled = true;
      setTrailerFetching(false);
      setShowTrailer(false);
      setTrailerYoutubeId(null);
      setTrailerProgress(0);
      setTrailerMuted(true);
      setTrailerVideoStarted(false);
    };
  }, [visible, release.shikimoriId, trailerEnabled]);

  useEffect(() => {
    if (!visible || !trailerYoutubeId || showTrailer || !trailerEnabled) return;

    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - hoverStartedAtRef.current;
      const progress = Math.min(100, (elapsed / trailerDelayMs) * 100);
      setTrailerProgress(progress);

      if (progress >= 100) {
        setShowTrailer(true);
        return;
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [visible, trailerYoutubeId, showTrailer, trailerEnabled, trailerDelayMs]);

  const playingTrailer = trailerEnabled && showTrailer && Boolean(trailerYoutubeId);

  useEffect(() => {
    if (!playingTrailer) {
      setTrailerVideoStarted(false);
      clearOverlayFallbackTimer();
      clearListenRetryTimers();
      return;
    }

    let cancelled = false;
    setTrailerVideoStarted(false);
    scheduleOverlayFallback();

    const markStarted = () => {
      if (cancelled) return;
      clearOverlayFallbackTimer();
      markTrailerVideoStarted();
    };

    const unsubscribe = subscribeYoutubePlayerEvents({
      onPlaying: markStarted,
      onEnded: () => {
        const iframe = trailerIframeRef.current;
        if (!iframe || cancelled) return;
        sendYoutubePlayerCommand(iframe, "seekTo", [0, true]);
        sendYoutubePlayerCommand(iframe, "playVideo");
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
      clearOverlayFallbackTimer();
      clearListenRetryTimers();
    };
  }, [playingTrailer, trailerYoutubeId]);

  const showTrailerProgress = trailerEnabled && visible && Boolean(trailerYoutubeId) && !playingTrailer;

  const handleSpeakerEnter = () => {
    setTrailerMuted(false);
    const iframe = trailerIframeRef.current;
    if (!iframe) return;
    sendYoutubePlayerCommand(iframe, "unMute");
    sendYoutubePlayerCommand(iframe, "setVolume", [100]);
  };

  const handleSpeakerLeave = () => {
    setTrailerMuted(true);
    const iframe = trailerIframeRef.current;
    if (!iframe) return;
    sendYoutubePlayerCommand(iframe, "mute");
  };

  const handleIframeLoad = (iframe: HTMLIFrameElement) => {
    beginYoutubePlayerListening(iframe);
    scheduleOverlayFallback();
  };

  const trailerIframeId = trailerYoutubeId ? `yt-trailer-${trailerYoutubeId}` : undefined;

  const previewInner = playingTrailer ? (
    <>
      <div className="release-card-hover-trailer-wrap absolute inset-0 overflow-hidden">
        <iframe
          ref={trailerIframeRef}
          id={trailerIframeId}
          src={youtubeTrailerEmbedUrl(trailerYoutubeId!, { muted: true, origin: embedOrigin || undefined })}
          title="YouTube video player"
          className="release-card-hover-trailer cursor-pointer border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          onLoad={(event) => handleIframeLoad(event.currentTarget)}
        />
      </div>

      {!trailerVideoStarted ? (
        <div
          className="release-card-trailer-overlay pointer-events-none absolute inset-0 z-[2] overflow-hidden bg-surface-dim"
          aria-hidden
        >
          <TrailerPreviewImage
            previewUrl={previewUrl}
            release={release}
            className="block h-full w-full object-cover"
          />
        </div>
      ) : null}
    </>
  ) : (
    <TrailerPreviewImage
      previewUrl={previewUrl}
      release={release}
      className="block h-full w-full object-cover"
    />
  );

  const previewWrapperClass = playingTrailer
    ? "absolute inset-0 leading-none"
    : animeHref
      ? "absolute inset-0 block leading-none"
      : "absolute inset-0 leading-none";

  const panelClassName = portal
    ? "release-card-hover-panel release-card-hover-panel--portal hidden md:block"
    : "release-card-hover-panel absolute left-1/2 top-0 z-50 hidden w-[320px] md:block";

  const panelVisibilityClass = visible ? "is-visible" : "";

  const panelNode = (
    <div
      ref={panelRef}
      className={[panelClassName, panelVisibilityClass].filter(Boolean).join(" ")}
      style={portal ? portalStyle : ({ "--hover-panel-x": `${panelOffsetX}px` } as CSSProperties)}
      aria-hidden={!visible}
    >
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/70 ring-1 ring-white/5 max-h-[inherit]">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-surface-dim">
          {playingTrailer ? (
            <div className={previewWrapperClass}>{previewInner}</div>
          ) : animeHref ? (
            <AnimeLink
              href={animeHref}
              className={previewWrapperClass}
              aria-label={`Открыть «${release.animeTitle}»`}
            >
              {previewInner}
            </AnimeLink>
          ) : (
            <div className={previewWrapperClass}>{previewInner}</div>
          )}

          <div className="pointer-events-none absolute bottom-2 left-2 z-[16]">
            {release.translationName ? <TranslationBadge name={release.translationName} /> : null}
          </div>

          {trailerFetching && trailerEnabled && !playingTrailer ? (
            <div
              className="pointer-events-none absolute right-2 top-2 z-[16] flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white shadow-sm"
              aria-hidden
            >
              <LoadingSpinner size="xs" />
            </div>
          ) : null}

          {playingTrailer ? (
            <button
              type="button"
              className="absolute right-0 top-0 z-20 p-3"
              aria-label={trailerMuted ? "Включить звук трейлера" : "Звук трейлера включён"}
              onPointerEnter={handleSpeakerEnter}
              onPointerLeave={handleSpeakerLeave}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/90 shadow-sm backdrop-blur-sm transition hover:border-white/25 hover:bg-black/70 hover:text-white">
                <TrailerSpeakerIcon muted={trailerMuted} />
              </span>
            </button>
          ) : null}

          {showTrailerProgress ? (
            <div
              className="release-card-trailer-progress pointer-events-none absolute inset-x-0 bottom-0 z-[17] h-0.5 bg-foreground/10"
              aria-hidden
            >
              <div
                className="release-card-trailer-progress-fill h-full bg-accent"
                style={{ width: `${trailerProgress}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="relative space-y-2 bg-card p-3">
          {animeHref ? (
            <AnimeLink href={animeHref} className="block text-sm font-semibold leading-snug text-foreground hover:text-accent">
              {release.animeTitle}
            </AnimeLink>
          ) : (
            <p className="text-sm font-semibold leading-snug text-foreground">{release.animeTitle}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <ReleaseMetaRow release={release} />
            {release.shikimoriId ? (
              <ReleaseRewatchBadge shikimoriId={release.shikimoriId} readOnly={readOnly} />
            ) : null}
          </div>
          <ReleaseGenresRow genres={release.genres} />

          {description ? (
            <p className="line-clamp-3 text-xs leading-relaxed text-foreground/90">{description}</p>
          ) : (
            <p className="text-xs text-muted">Описание пока недоступно.</p>
          )}

          {animeHref ? (
            <AnimeLink
              href={watchHref}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-dim px-4 py-2.5 text-sm font-medium text-muted transition hover:border-accent hover:bg-accent hover:text-white"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M7 5.5v9l7-4.5-7-4.5z" />
              </svg>
              Смотреть онлайн
            </AnimeLink>
          ) : (
            <a
              href={watchHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-dim px-4 py-2.5 text-sm font-medium text-muted transition hover:border-accent hover:bg-accent hover:text-white"
            >
              Смотреть онлайн
            </a>
          )}

          {onDeleteFromHistory ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void onDeleteFromHistory();
              }}
              disabled={deletingFromHistory}
              aria-busy={deletingFromHistory}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/30 bg-surface-dim px-4 py-2.5 text-sm font-medium text-red-400 transition hover:border-red-500 hover:bg-red-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              {deletingFromHistory ? (
                <LoadingSpinner size="xs" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {deletingFromHistory ? "Удаление…" : "Удалить из истории"}
            </button>
          ) : null}

          {release.shikimoriId ? (
            <ReleaseCardQuickActions shikimoriId={release.shikimoriId} />
          ) : null}
          <AdminAnimeDebugButton
            shikimoriId={release.shikimoriId}
            materialId={release.materialId}
            seasonNumber={release.episodeNumber > 0 ? release.seasonNumber : null}
            episodeNumber={release.episodeNumber > 0 ? release.episodeNumber : null}
            compact
          />
        </div>
      </div>
    </div>
  );

  if (portal) {
    if (!portalMounted || !visible) return null;
    return createPortal(panelNode, document.body);
  }

  return panelNode;
}
