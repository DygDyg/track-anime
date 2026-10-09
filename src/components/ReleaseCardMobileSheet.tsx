"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AdminAnimeDebugButton } from "@/components/admin/AdminAnimeDebugButton";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { FavoriteRewatchBadge } from "@/components/favorites/FavoriteRewatchBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { ReleaseCardGenresRow, ReleaseCardMetaRow } from "@/components/ReleaseCardPreviewMeta";
import { ReleaseCardQuickActions } from "@/components/ReleaseCardQuickActions";
import { TranslationBadge } from "@/components/TranslationBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { HoverPanelReleaseInput } from "@/lib/hover-panel-release";

const SWIPE_CLOSE_PX = 80;

function stripDescription(text: string | null): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain || null;
}

function SheetRewatchBadge({
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

type Props = {
  open: boolean;
  onClose: () => void;
  release: HoverPanelReleaseInput;
  previewUrl: string | null;
  animeHref: string | null;
  onDeleteFromHistory?: () => void | Promise<void>;
  deletingFromHistory?: boolean;
  readOnly?: boolean;
};

export function ReleaseCardMobileSheet({
  open,
  onClose,
  release,
  previewUrl,
  animeHref,
  onDeleteFromHistory,
  deletingFromHistory = false,
  readOnly = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const description = stripDescription(release.description);
  const watchHref = animeHref ? `${animeHref}#player` : release.playerLink ?? "#";

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY;
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const delta = Math.max(0, event.clientY - dragStartY.current);
    setDragOffset(delta);
  };

  const onHandlePointerUp = () => {
    if (dragStartY.current == null) return;
    const shouldClose = dragOffset >= SWIPE_CLOSE_PX;
    dragStartY.current = null;
    setDragOffset(0);
    if (shouldClose) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:hidden">
      <button
        type="button"
        aria-label="Закрыть превью"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={release.animeTitle}
        className="relative flex max-h-[min(88dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl shadow-black/50"
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: "none" }
            : undefined
        }
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center px-4 pb-1 pt-2 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="h-1 w-10 rounded-full bg-foreground/25" aria-hidden />
          <div className="mt-1 flex w-full items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Закрыть"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="relative aspect-video w-full overflow-hidden bg-surface-dim">
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt=""
                  className="block h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center p-6">
                <AnimePoster
                  src={release.posterUrl}
                  fallbackSrc={release.screenshotUrl}
                  shikimoriId={release.shikimoriId}
                  alt={release.animeTitle}
                  className="max-h-full max-w-[40%] rounded-md object-contain shadow-lg"
                />
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 z-[2]">
              {release.translationName ? <TranslationBadge name={release.translationName} /> : null}
            </div>
          </div>

          <div className="space-y-2 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {animeHref ? (
              <AnimeLink
                href={animeHref}
                onClick={onClose}
                className="block text-sm font-semibold leading-snug text-foreground hover:text-accent"
              >
                {release.animeTitle}
              </AnimeLink>
            ) : (
              <p className="text-sm font-semibold leading-snug text-foreground">{release.animeTitle}</p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <ReleaseCardMetaRow release={release} />
              {release.shikimoriId ? (
                <SheetRewatchBadge shikimoriId={release.shikimoriId} readOnly={readOnly} />
              ) : null}
            </div>

            <ReleaseCardGenresRow genres={release.genres} />

            {description ? (
              <p className="text-xs leading-relaxed text-foreground/90">{description}</p>
            ) : (
              <p className="text-xs text-muted">Описание пока недоступно.</p>
            )}

            {animeHref ? (
              <AnimeLink
                href={watchHref}
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent/90"
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
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent/90"
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

            {release.shikimoriId ? <ReleaseCardQuickActions shikimoriId={release.shikimoriId} /> : null}
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
    </div>,
    document.body,
  );
}
