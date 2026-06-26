"use client";

import {
  FAVORITES_TAB_THEMES,
  listStatusCardAccentClass,
  listStatusThemeKey,
} from "@/components/favorites/favorites-tab-theme";
import {
  getListBadgeLabel,
  shouldShowListBadge,
  type UserAnimeListInfo,
} from "@/lib/user-anime-list-status";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";

type Props = {
  info: UserAnimeListInfo | null | undefined;
  className?: string;
  size?: "sm" | "md";
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[10px] sm:text-[11px]",
  md: "px-2.5 py-1 text-xs sm:text-[13px]",
} as const;

export function ListStatusBadge({ info, className = "", size = "sm" }: Props) {
  if (!shouldShowListBadge(info)) return null;

  const label = getListBadgeLabel(info!);
  if (!label) return null;

  const badgeTheme = FAVORITES_TAB_THEMES[listStatusThemeKey(info!.listStatus)];

  return (
    <span
      className={[
        "max-w-[calc(100%-0.75rem)] truncate rounded-lg border font-bold uppercase tracking-wide backdrop-blur-[2px]",
        SIZE_CLASSES[size],
        badgeTheme.posterBadge,
        className,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

/** Метка «У вас · …» при просмотре чужого списка. */
export function ViewerListStatusBadge({
  shikimoriId,
  className = "",
  size = "sm",
}: {
  shikimoriId: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const info = useUserListStatus(shikimoriId);
  if (!shouldShowListBadge(info)) return null;

  const label = getListBadgeLabel(info!);
  if (!label) return null;

  const badgeTheme = FAVORITES_TAB_THEMES[listStatusThemeKey(info!.listStatus)];

  return (
    <span
      className={[
        "max-w-[calc(100%-0.75rem)] truncate rounded-lg border font-bold uppercase tracking-wide backdrop-blur-[2px]",
        SIZE_CLASSES[size],
        badgeTheme.posterBadge,
        className,
      ].join(" ")}
      title={`У вас в списке: ${label}`}
    >
      У вас · {label}
    </span>
  );
}

export function useViewerListStatusAccent(shikimoriId: number, enabled: boolean): string | null {
  const info = useUserListStatus(enabled ? shikimoriId : null);
  if (!enabled || !shouldShowListBadge(info)) return null;
  return listStatusCardAccentClass(info!.listStatus);
}
