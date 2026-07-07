"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useUserListStatus,
  useUserListStatusActions,
} from "@/components/favorites/UserListStatusProvider";
import {
  effectiveRewatches,
  formatRewatchTimesLabel,
  formatRewatchedLabel,
  REWATCH_TIMES_HINT,
} from "@/lib/anime-rewatches";

export function AnimeRewatchAction({ shikimoriId }: { shikimoriId: number }) {
  const router = useRouter();
  const listInfo = useUserListStatus(shikimoriId);
  const { updateList } = useUserListStatusActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!listInfo || listInfo.listStatus !== "completed") return null;

  const count = effectiveRewatches(listInfo.rewatches, listInfo.listStatus);
  const countLabel = formatRewatchTimesLabel(count);
  const rewatchedLabel = formatRewatchedLabel(count);

  async function handleRewatch() {
    const next = count + 1;
    if (
      !window.confirm(
        `Отметить новый пересмотр? Будет «${formatRewatchTimesLabel(next)}», дата «Просмотрено» обновится на Shikimori.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await updateList(shikimoriId, { rewatch: true });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отметить пересмотр");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted" title={REWATCH_TIMES_HINT}>
        Смотрели целиком: <span className="font-semibold text-foreground">{countLabel}</span>
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void handleRewatch()}
        title={REWATCH_TIMES_HINT}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          "Сохранение…"
        ) : (
          <>
            <span className="sm:hidden">{rewatchedLabel} (+1)</span>
            <span className="hidden sm:inline">+1 пересмотр · {rewatchedLabel}</span>
          </>
        )}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
