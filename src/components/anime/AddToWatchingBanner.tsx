"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useUserListStatus,
  useUserListStatusActions,
} from "@/components/favorites/UserListStatusProvider";
import { FAVORITES_TAB_THEMES } from "@/components/favorites/favorites-tab-theme";
import { dismissAddToWatchingPrompt } from "@/lib/add-to-watching-prompt";

type Props = {
  shikimoriId: number;
  open: boolean;
  onClose: () => void;
};

const plannedTheme = FAVORITES_TAB_THEMES.planned;
const watchingTheme = FAVORITES_TAB_THEMES.watching;

const BLOCKED_STATUSES = new Set(["watching", "rewatching", "completed"]);

export function AddToWatchingBanner({ shikimoriId, open, onClose }: Props) {
  const listInfo = useUserListStatus(shikimoriId);
  const { updateList, isUpdating } = useUserListStatusActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = listInfo?.listStatus?.trim().toLowerCase() ?? "";
  const blocked = BLOCKED_STATUSES.has(status);

  useEffect(() => {
    if (!open) {
      setError(null);
      setPending(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && blocked) {
      onClose();
    }
  }, [blocked, onClose, open]);

  const handleDismiss = useCallback(() => {
    dismissAddToWatchingPrompt(shikimoriId);
    onClose();
  }, [onClose, shikimoriId]);

  const handleConfirm = useCallback(async () => {
    if (pending || isUpdating(shikimoriId)) return;
    setPending(true);
    setError(null);
    try {
      await updateList(shikimoriId, { listStatus: "watching" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить список");
      setPending(false);
    }
  }, [isUpdating, onClose, pending, shikimoriId, updateList]);

  if (!open || blocked) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "mb-3 flex flex-col gap-2 rounded-lg px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        plannedTheme.tabActive,
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">
          Смотрите первую серию. Добавить в «Смотрю»?
        </p>
        {error ? <p className="mt-1 text-xs text-red-100">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          className="rounded-md border border-white/35 bg-white/15 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
        >
          Не сейчас
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={pending || isUpdating(shikimoriId)}
          className={[
            "rounded-md px-3.5 py-1.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50",
            watchingTheme.tabActive,
          ].join(" ")}
        >
          {pending ? "Сохранение…" : "Смотрю"}
        </button>
      </div>
    </div>
  );
}
