"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { WATCH_HISTORY_UPDATED_EVENT } from "@/components/anime/AnimePosterWatchActions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { WatchProgressDto } from "@/lib/watch-history";

type Props = {
  shikimoriId: number;
  animeTitle: string;
  /** Kodik material id выбранной озвучки; без него add недоступен. */
  kodikId: string | null;
  /** Панель/шторка открыта — тогда грузим статус. */
  active: boolean;
  /**
   * Родительский delete (confirm + DELETE + UI-список), как на `/history`.
   * При наличии — всегда показываем «Удалить» и делегируем клик родителю.
   */
  onDeleteFromHistory?: () => void | Promise<void>;
  deletingFromHistory?: boolean;
};

function dispatchHistoryUpdated(shikimoriId: number, progress: WatchProgressDto | null) {
  window.dispatchEvent(
    new CustomEvent(WATCH_HISTORY_UPDATED_EVENT, {
      detail: { shikimoriId, progress },
    }),
  );
}

const deleteButtonClassName =
  "flex w-full items-center justify-center gap-2 rounded-full border border-red-500/30 bg-surface-dim px-4 py-2.5 text-sm font-medium text-red-400 transition hover:border-red-500 hover:bg-red-500 hover:text-white disabled:cursor-wait disabled:opacity-60";

const addButtonClassName =
  "flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-wait disabled:opacity-60";

/** Add / remove watch history из hover-панели и mobile sheet. */
export function ReleaseCardWatchHistoryAction({
  shikimoriId,
  animeTitle,
  kodikId,
  active,
  onDeleteFromHistory,
  deletingFromHistory = false,
}: Props) {
  const { user } = useAuth();
  const parentOwnsDelete = Boolean(onDeleteFromHistory);
  const [hasProgress, setHasProgress] = useState<boolean | undefined>(
    parentOwnsDelete ? true : undefined,
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user || !active || parentOwnsDelete) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/user/watch-history/${shikimoriId}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setHasProgress(false);
          return;
        }
        const data = (await res.json()) as { progress?: WatchProgressDto | null };
        if (!cancelled) setHasProgress(data.progress != null);
      } catch {
        if (!cancelled) setHasProgress(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, active, shikimoriId, parentOwnsDelete]);

  useEffect(() => {
    if (!user || parentOwnsDelete) return;

    const onHistoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ shikimoriId: number; progress: WatchProgressDto | null }>)
        .detail;
      if (detail?.shikimoriId !== shikimoriId) return;
      setHasProgress(detail.progress != null);
    };

    window.addEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
  }, [user, shikimoriId, parentOwnsDelete]);

  const handleDelete = useCallback(async () => {
    if (onDeleteFromHistory) {
      await onDeleteFromHistory();
      return;
    }
    if (pending) return;

    const confirmed = window.confirm(`Удалить «${animeTitle}» из истории?`);
    if (!confirmed) return;

    setPending(true);
    try {
      const res = await fetch(`/api/user/watch-history/${shikimoriId}`, { method: "DELETE" });
      if (!res.ok) return;
      setHasProgress(false);
      dispatchHistoryUpdated(shikimoriId, null);
    } finally {
      setPending(false);
    }
  }, [onDeleteFromHistory, pending, animeTitle, shikimoriId]);

  const handleAdd = useCallback(async () => {
    if (!kodikId || pending || hasProgress) return;

    setPending(true);
    try {
      const res = await fetch(`/api/user/watch-history/${shikimoriId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kodikId,
          seasonNumber: 1,
          episodeNumber: 0,
          positionSeconds: 0,
        }),
      });
      if (!res.ok) return;

      const data = (await res.json()) as { progress?: WatchProgressDto | null };
      if (data.progress) {
        setHasProgress(true);
        dispatchHistoryUpdated(shikimoriId, data.progress);
      }
    } finally {
      setPending(false);
    }
  }, [kodikId, pending, hasProgress, shikimoriId]);

  if (!user) return null;

  const busy = pending || deletingFromHistory;

  if (parentOwnsDelete || hasProgress === true) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleDelete();
        }}
        disabled={busy}
        aria-busy={busy}
        className={deleteButtonClassName}
      >
        {busy ? (
          <LoadingSpinner size="xs" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14M10 11v6M14 11v6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {busy ? "Удаление…" : "Удалить из истории"}
      </button>
    );
  }

  if (hasProgress === undefined) return null;
  if (!kodikId) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleAdd();
      }}
      disabled={pending}
      aria-busy={pending}
      title="Сохранить в историю, чтобы продолжить на другом устройстве"
      className={addButtonClassName}
    >
      {pending ? "Сохранение…" : "Добавить в историю"}
    </button>
  );
}
