"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  FAVORITES_TAB_THEMES,
  type FavoritesTabTheme,
} from "@/components/favorites/favorites-tab-theme";
import {
  useUserListStatus,
  useUserListStatusActions,
} from "@/components/favorites/UserListStatusProvider";
import { LIST_STATUS_LABELS } from "@/lib/shikimori/user-rates";
import type { ShikimoriListStatus } from "@/lib/shikimori/user-rates.types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const QUICK_LIST_ACTIONS: ShikimoriListStatus[] = ["watching", "planned", "completed"];

function quickActionClass(theme: FavoritesTabTheme, active: boolean): string {
  const layout =
    "flex h-10 w-full items-center justify-center rounded-lg transition active:scale-[0.98]";
  return `${layout} ${active ? theme.tabActive : theme.tabInactive}`;
}

function ListStatusIcon({ status }: { status: ShikimoriListStatus }) {
  switch (status) {
    case "watching":
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path
            d="M2.5 10s2.5-5 7.5-5 7.5 5 7.5 5-2.5 5-7.5 5-7.5-5-7.5-5z"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10" r="2.25" />
        </svg>
      );
    case "planned":
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4.5l3 1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "completed":
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M5.5 10.5 8.5 13.5 14.5 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function ActionButton({
  label,
  active,
  disabled,
  onClick,
  children,
  theme,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  theme: FavoritesTabTheme;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[quickActionClass(theme, active), disabled ? "cursor-wait opacity-70" : ""].join(" ")}
    >
      {disabled ? <LoadingSpinner size="xs" /> : children}
    </button>
  );
}

export function ReleaseCardQuickActions({ shikimoriId }: { shikimoriId: number }) {
  const { user, login, authNavigating } = useAuth();
  const listInfo = useUserListStatus(shikimoriId);
  const { updateList, isUpdating } = useUserListStatusActions();
  const pending = isUpdating(shikimoriId);

  if (!user) {
    return (
      <button
        type="button"
        onClick={login}
        disabled={authNavigating}
        aria-busy={authNavigating || undefined}
        className={[
          "w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-muted transition hover:border-accent/40 hover:text-foreground",
          authNavigating ? "cursor-wait opacity-70" : "",
        ].join(" ")}
      >
        {authNavigating ? (
          <span className="inline-flex items-center justify-center gap-1.5">
            <LoadingSpinner size="xs" />
            Вход…
          </span>
        ) : (
          "Войдите, чтобы добавить в списки"
        )}
      </button>
    );
  }

  const run = async (status: ShikimoriListStatus) => {
    if (pending) return;
    const isActive = listInfo?.listStatus === status;
    try {
      await updateList(shikimoriId, { listStatus: isActive ? null : status });
    } catch {
      /* isUpdating сбрасывается в провайдере */
    }
  };

  return (
    <div className="grid grid-cols-3 gap-1.5 border-t border-border/80 pt-2">
      {QUICK_LIST_ACTIONS.map((status) => {
        const theme = FAVORITES_TAB_THEMES[status];
        const active = listInfo?.listStatus === status;
        const label = LIST_STATUS_LABELS[status] ?? status;
        return (
          <ActionButton
            key={status}
            label={label}
            active={active}
            disabled={pending}
            theme={theme}
            onClick={() => void run(status)}
          >
            <ListStatusIcon status={status} />
          </ActionButton>
        );
      })}
    </div>
  );
}
