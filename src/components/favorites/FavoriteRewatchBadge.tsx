"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUserListStatusActions } from "@/components/favorites/UserListStatusProvider";
import {
  effectiveRewatches,
  formatRewatchTimesLabel,
  normalizeRewatchesInput,
  REWATCH_TIMES_HINT,
  showsRewatchCount,
} from "@/lib/anime-rewatches";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

function formatWatchedLabel(count: number): string {
  return `Просмотрено ${formatRewatchTimesLabel(count)}`;
}

type Props = {
  shikimoriId: number;
  listStatus: string | null;
  rewatches: number;
  readOnly?: boolean;
  className?: string;
};

export function FavoriteRewatchBadge({
  shikimoriId,
  listStatus,
  rewatches,
  readOnly = false,
  className = "",
}: Props) {
  const router = useRouter();
  const { updateList } = useUserListStatusActions();
  const [pending, setPending] = useState(false);

  if (!showsRewatchCount(listStatus)) return null;

  const count = effectiveRewatches(rewatches, listStatus);
  const label = formatWatchedLabel(count);

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (readOnly || pending) return;

    const input = window.prompt(
      `Сколько раз вы смотрели это аниме целиком?\n\n${REWATCH_TIMES_HINT}`,
      String(count),
    );
    if (input === null) return;

    const next = normalizeRewatchesInput(Number(input));
    if (next == null) {
      window.alert("Укажите целое число от 1 до 999.");
      return;
    }

    if (next === count) return;

    if (
      !window.confirm(
        `Установить «${formatWatchedLabel(next)}»? Сохранится только на Track Anime, дата на Shikimori не изменится.`,
      )
    ) {
      return;
    }

    setPending(true);
    try {
      await updateList(shikimoriId, { rewatches: next });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось обновить счётчик");
    } finally {
      setPending(false);
    }
  }

  if (readOnly) {
    return (
      <span
        className={[
          "inline-flex items-center rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm",
          className,
        ].join(" ")}
        title={REWATCH_TIMES_HINT}
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => void handleClick(event)}
      disabled={pending}
      className={[
        "inline-flex items-center rounded-md border border-border/80 bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm transition",
        "hover:border-accent/50 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ].join(" ")}
      title={`${REWATCH_TIMES_HINT} Нажмите, чтобы изменить.`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1">
          <LoadingSpinner size="xs" />
          <span className="sr-only">Сохранение</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}
