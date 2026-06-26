"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserListStatus,
  useUserListStatusActions,
} from "@/components/favorites/UserListStatusProvider";
import {
  listStatusDropdownMenuItemClass,
  listStatusDropdownTriggerClass,
  listStatusThemeKey,
} from "@/components/favorites/favorites-tab-theme";
import type { ListStatusTab } from "@/lib/shikimori/user-rates";
import { LIST_STATUS_LABELS } from "@/lib/shikimori/user-rates";
import type { ShikimoriListStatus } from "@/lib/shikimori/user-rates.types";

const SELECT_BOOKMARK = "bookmark";
const SELECT_REMOVE = "__remove__";

/** Порядок как на Shikimori / в референсе */
const DROPDOWN_STATUSES: ShikimoriListStatus[] = [
  "watching",
  "completed",
  "dropped",
  "on_hold",
  "planned",
  "rewatching",
];

type MenuValue = typeof SELECT_BOOKMARK | typeof SELECT_REMOVE | ShikimoriListStatus;

function getCurrentValue(listInfo: ReturnType<typeof useUserListStatus>): MenuValue | null {
  if (!listInfo) return null;
  if (listInfo.listStatus) return listInfo.listStatus as ShikimoriListStatus;
  if (listInfo.isBookmark) return SELECT_BOOKMARK;
  return null;
}

function getMenuItemThemeKey(value: MenuValue): ListStatusTab {
  if (value === SELECT_BOOKMARK) return "bookmarks";
  if (value === SELECT_REMOVE) return "dropped";
  return listStatusThemeKey(value);
}

function getTriggerLabel(value: MenuValue | null): string {
  if (!value) return "Добавить в список";
  if (value === SELECT_BOOKMARK) return LIST_STATUS_LABELS.bookmarks;
  return LIST_STATUS_LABELS[value] ?? "Добавить в список";
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
      fill="currentColor"
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function AnimeListActions({ shikimoriId }: { shikimoriId: number }) {
  const { user, loading: authLoading, login } = useAuth();
  const { loading: listsLoading, updateList } = useUserListStatusActions();
  const listInfo = useUserListStatus(shikimoriId);
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentValue = useMemo(() => getCurrentValue(listInfo), [listInfo]);
  const hasEntry = currentValue != null;
  const triggerLabel = getTriggerLabel(currentValue);
  const triggerClass = useMemo(
    () => listStatusDropdownTriggerClass(listInfo?.listStatus ?? null, listInfo?.isBookmark ?? false),
    [listInfo],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (authLoading || listsLoading) {
    return (
      <div className="mt-4">
        <div className="h-11 animate-pulse rounded-lg bg-surface-dim" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
        <p className="text-sm text-muted">Войдите, чтобы добавить аниме в списки Shikimori.</p>
        <button
          type="button"
          onClick={login}
          className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
        >
          Войти
        </button>
      </div>
    );
  }

  async function applyChange(value: MenuValue) {
    if (value === currentValue) {
      setOpen(false);
      return;
    }

    setPending(true);
    setError(null);
    setOpen(false);

    try {
      if (value === SELECT_REMOVE) {
        await updateList(shikimoriId, { removeAll: true });
        return;
      }

      if (value === SELECT_BOOKMARK) {
        await updateList(shikimoriId, { bookmark: true });
        return;
      }

      await updateList(shikimoriId, { listStatus: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить список");
    } finally {
      setPending(false);
    }
  }

  function renderMenuItem(value: MenuValue, label: string) {
    const active = currentValue === value;
    const themeKey = getMenuItemThemeKey(value);

    return (
      <button
        key={value}
        type="button"
        disabled={pending}
        onClick={() => void applyChange(value)}
        className={[
          "flex w-full items-center px-3 py-2 text-left text-sm font-semibold transition",
          listStatusDropdownMenuItemClass(themeKey, active),
          pending ? "cursor-not-allowed opacity-60" : "",
        ].join(" ")}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mt-4" ref={rootRef}>
      <div className="relative max-w-md">
        <button
          type="button"
          disabled={pending}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={[
            "flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
            triggerClass,
            "disabled:cursor-not-allowed disabled:opacity-70",
          ].join(" ")}
        >
          <span className="truncate lowercase">{pending ? "Сохранение…" : triggerLabel}</span>
          <ChevronDown open={open} />
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="Статус в списках"
            className="absolute left-0 right-0 top-full z-30 mt-1 space-y-1 overflow-hidden rounded-lg border border-border/90 bg-card p-1 shadow-xl shadow-black/50"
          >
            {DROPDOWN_STATUSES.map((status) =>
              renderMenuItem(status, LIST_STATUS_LABELS[status] ?? status),
            )}

            {renderMenuItem(SELECT_BOOKMARK, LIST_STATUS_LABELS.bookmarks)}

            {hasEntry ? renderMenuItem(SELECT_REMOVE, "Удалить из списков") : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/favorites" className="text-xs font-medium text-accent transition hover:underline">
          Мои списки
        </Link>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    </div>
  );
}
