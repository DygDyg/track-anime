"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { WatchProgressDto } from "@/lib/watch-history";

type Props = {
  shikimoriId: number;
  kodikId: string;
  ready?: boolean;
  hasProgress: boolean;
  onProgressSaved?: (progress: WatchProgressDto) => void;
  className?: string;
  fullWidth?: boolean;
};

/** Добавляет тайтл в историю просмотра (1 серия, 0 сек) для продолжения на другом устройстве. */
export function AnimeAddToHistoryButton({
  shikimoriId,
  kodikId,
  ready = true,
  hasProgress,
  onProgressSaved,
  className = "",
  fullWidth = false,
}: Props) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const handleClick = useCallback(async () => {
    if (!user || !kodikId || pending || hasProgress || justAdded) return;

    setPending(true);
    setError(null);

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

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Не удалось добавить в историю");
        return;
      }

      const data = (await res.json()) as { progress?: WatchProgressDto | null; cleared?: boolean };
      if (data.progress) {
        onProgressSaved?.(data.progress);
        setJustAdded(true);
        return;
      }

      if (data.cleared) {
        setError("Запись не сохранена");
      }
    } catch {
      setError("Не удалось добавить в историю");
    } finally {
      setPending(false);
    }
  }, [user, kodikId, pending, hasProgress, justAdded, shikimoriId, onProgressSaved]);

  if (!user || !ready || !kodikId || hasProgress || justAdded) return null;

  return (
    <div className={className}>
      <button
        type="button"
        data-tv-focus
        onClick={() => void handleClick()}
        disabled={pending}
        title="Сохранить в историю, чтобы продолжить на другом устройстве"
        className={[
          fullWidth
            ? "inline-flex w-full items-center justify-center rounded-xl border border-border bg-background/70 px-4 py-3 text-sm font-semibold transition"
            : "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
          pending
            ? "cursor-wait border-border bg-background text-muted"
            : fullWidth
              ? "border-border text-foreground hover:border-accent/40 hover:bg-surface-dim active:scale-[0.98]"
              : "border-border bg-background text-foreground hover:border-accent/40 hover:bg-surface-dim active:scale-[0.98]",
        ].join(" ")}
      >
        {pending ? "Сохранение…" : "В историю"}
      </button>
      {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
