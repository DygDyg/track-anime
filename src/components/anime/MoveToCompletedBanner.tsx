"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useUserListStatus,
  useUserListStatusActions,
} from "@/components/favorites/UserListStatusProvider";
import { FAVORITES_TAB_THEMES } from "@/components/favorites/favorites-tab-theme";
import { dismissMoveToCompletedPrompt } from "@/lib/move-to-completed-prompt";

type Props = {
  shikimoriId: number;
  open: boolean;
  onClose: () => void;
};

const watchingTheme = FAVORITES_TAB_THEMES.watching;
const completedTheme = FAVORITES_TAB_THEMES.completed;

export function MoveToCompletedBanner({ shikimoriId, open, onClose }: Props) {
  const listInfo = useUserListStatus(shikimoriId);
  const { updateList, isUpdating } = useUserListStatusActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setPending(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && listInfo?.listStatus === "completed") {
      onClose();
    }
  }, [listInfo?.listStatus, onClose, open]);

  const handleDismiss = useCallback(() => {
    dismissMoveToCompletedPrompt(shikimoriId);
    onClose();
  }, [onClose, shikimoriId]);

  const handleConfirm = useCallback(async () => {
    if (pending || isUpdating(shikimoriId)) return;
    setPending(true);
    setError(null);
    try {
      await updateList(shikimoriId, { listStatus: "completed" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить список");
      setPending(false);
    }
  }, [isUpdating, onClose, pending, shikimoriId, updateList]);

  if (!open || listInfo?.listStatus === "completed") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "mb-3 flex flex-col gap-2 rounded-lg px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        watchingTheme.tabActive,
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">
          Сериал досмотрен. Перенести в «Просмотрено»?
        </p>
        {error ? <p className="mt-1 text-xs text-red-800">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          className="rounded-md border border-black/25 bg-black/10 px-3 py-1.5 text-sm font-medium text-black/80 transition hover:bg-black/20 disabled:opacity-50"
        >
          Не сейчас
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={pending || isUpdating(shikimoriId)}
          className={[
            "rounded-md px-3.5 py-1.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50",
            completedTheme.tabActive,
          ].join(" ")}
        >
          {pending ? "Сохранение…" : "Просмотрено"}
        </button>
      </div>
    </div>
  );
}
