import type { ListStatusTab } from "@/lib/shikimori/user-rates";

/** Цвета статусов с track-anime.dygdyg.ru (sh_api.status_color + styles.css) */
export const TRACK_ANIME_LIST_COLORS = {
  watching: "#ffdd00",
  completed: "#3b8a3f",
  dropped: "#9a3838",
  on_hold: "#ab7a2f",
  planned: "#ff00fb",
  rewatching: "#31d2f2",
} as const;

export type FavoritesTabTheme = {
  tabActive: string;
  tabInactive: string;
  countActive: string;
  countInactive: string;
  posterBadge: string;
  cardAccent: string;
};

export const FAVORITES_TAB_THEMES: Record<ListStatusTab, FavoritesTabTheme> = {
  watching: {
    tabActive: "border border-[#dec104] bg-[#ffdd00] text-black shadow-md shadow-[#ffdd00]/40",
    tabInactive:
      "border border-[#ffdd00]/45 bg-[#ffdd00]/12 text-[#ffdd00] hover:border-[#ffdd00]/65 hover:bg-[#ffdd00]/22 hover:text-[#fff3a0]",
    countActive: "bg-black/15 text-black",
    countInactive: "bg-[#ffdd00]/25 text-[#ffdd00]",
    posterBadge:
      "border-[#dec104]/80 bg-[#b49d03]/95 text-black shadow-lg shadow-black/50 ring-1 ring-[#ffdd00]/50",
    cardAccent: "border-l-[#ffdd00]",
  },
  completed: {
    tabActive: "border border-[#2d6a2e] bg-[#3b8a3f] text-white shadow-md shadow-[#3b8a3f]/40",
    tabInactive:
      "border border-[#3b8a3f]/45 bg-[#3b8a3f]/12 text-[#6fcf73] hover:border-[#3b8a3f]/65 hover:bg-[#3b8a3f]/22 hover:text-[#9ae6a0]",
    countActive: "bg-white/25 text-white",
    countInactive: "bg-[#3b8a3f]/25 text-[#6fcf73]",
    posterBadge:
      "border-[#2d6a2e]/80 bg-[#3b8a3f]/95 text-white shadow-lg shadow-black/50 ring-1 ring-[#3b8a3f]/50",
    cardAccent: "border-l-[#3b8a3f]",
  },
  on_hold: {
    tabActive: "border border-[#865b24] bg-[#ab7a2f] text-white shadow-md shadow-[#ab7a2f]/40",
    tabInactive:
      "border border-[#ab7a2f]/45 bg-[#ab7a2f]/12 text-[#d4a056] hover:border-[#ab7a2f]/65 hover:bg-[#ab7a2f]/22 hover:text-[#e8bc78]",
    countActive: "bg-white/25 text-white",
    countInactive: "bg-[#ab7a2f]/25 text-[#d4a056]",
    posterBadge:
      "border-[#865b24]/80 bg-[#ab7a2f]/95 text-white shadow-lg shadow-black/50 ring-1 ring-[#ab7a2f]/50",
    cardAccent: "border-l-[#ab7a2f]",
  },
  dropped: {
    tabActive: "border border-[#792525] bg-[#9a3838] text-white shadow-md shadow-[#9a3838]/40",
    tabInactive:
      "border border-[#9a3838]/45 bg-[#9a3838]/12 text-[#e57373] hover:border-[#9a3838]/65 hover:bg-[#9a3838]/22 hover:text-[#ef9a9a]",
    countActive: "bg-white/25 text-white",
    countInactive: "bg-[#9a3838]/25 text-[#e57373]",
    posterBadge:
      "border-[#792525]/80 bg-[#9a3838]/95 text-white shadow-lg shadow-black/50 ring-1 ring-[#9a3838]/50",
    cardAccent: "border-l-[#9a3838]",
  },
  planned: {
    tabActive: "border border-[#c201bf] bg-[#ff00fb] text-white shadow-md shadow-[#ff00fb]/40",
    tabInactive:
      "border border-[#ff00fb]/45 bg-[#ff00fb]/12 text-[#ff66fc] hover:border-[#ff00fb]/65 hover:bg-[#ff00fb]/22 hover:text-[#ff99fd]",
    countActive: "bg-white/25 text-white",
    countInactive: "bg-[#ff00fb]/25 text-[#ff66fc]",
    posterBadge:
      "border-[#c201bf]/80 bg-[#9f039d]/95 text-white shadow-lg shadow-black/50 ring-1 ring-[#ff00fb]/50",
    cardAccent: "border-l-[#ff00fb]",
  },
  rewatching: {
    tabActive: "border border-[#25cff2] bg-[#31d2f2] text-black shadow-md shadow-[#31d2f2]/40",
    tabInactive:
      "border border-[#31d2f2]/45 bg-[#31d2f2]/12 text-[#31d2f2] hover:border-[#31d2f2]/65 hover:bg-[#31d2f2]/22 hover:text-[#7ae4f8]",
    countActive: "bg-black/15 text-black",
    countInactive: "bg-[#31d2f2]/25 text-[#31d2f2]",
    posterBadge:
      "border-[#25cff2]/80 bg-[#31d2f2]/95 text-black shadow-lg shadow-black/50 ring-1 ring-[#31d2f2]/50",
    cardAccent: "border-l-[#31d2f2]",
  },
  bookmarks: {
    tabActive: "border border-[#0a58ca] bg-[#0d6efd] text-white shadow-md shadow-[#0d6efd]/40",
    tabInactive:
      "border border-[#0d6efd]/45 bg-[#0d6efd]/12 text-[#6ea8fe] hover:border-[#0d6efd]/65 hover:bg-[#0d6efd]/22 hover:text-[#9ec5fe]",
    countActive: "bg-white/25 text-white",
    countInactive: "bg-[#0d6efd]/25 text-[#6ea8fe]",
    posterBadge:
      "border-[#0a58ca]/80 bg-[#0d6efd]/95 text-white shadow-lg shadow-black/50 ring-1 ring-[#0d6efd]/50",
    cardAccent: "border-l-[#0d6efd]",
  },
  all: {
    tabActive: "border border-[#495057] bg-[#6c757d] text-white shadow-md shadow-[#6c757d]/40",
    tabInactive:
      "border border-[#6c757d]/45 bg-[#6c757d]/12 text-[#adb5bd] hover:border-[#6c757d]/65 hover:bg-[#6c757d]/22 hover:text-[#ced4da]",
    countActive: "bg-white/25 text-white",
    countInactive: "bg-[#6c757d]/25 text-[#adb5bd]",
    posterBadge:
      "border-[#495057]/80 bg-[#6c757d]/95 text-white shadow-lg shadow-black/50 ring-1 ring-[#6c757d]/50",
    cardAccent: "border-l-[#6c757d]",
  },
};

export function listStatusThemeKey(listStatus: string | null): ListStatusTab {
  if (listStatus && listStatus in FAVORITES_TAB_THEMES) {
    return listStatus as ListStatusTab;
  }
  return "bookmarks";
}

export function listStatusCardAccentClass(listStatus: string | null): string | null {
  const theme = FAVORITES_TAB_THEMES[listStatusThemeKey(listStatus)];
  return theme.cardAccent;
}

export function listStatusDropdownTriggerClass(
  listStatus: string | null,
  isBookmark = false,
): string {
  if (!listStatus && !isBookmark) {
    return "border border-border bg-background text-foreground shadow-sm hover:bg-surface-dim";
  }

  const key = listStatus ? listStatusThemeKey(listStatus) : "bookmarks";
  return `${FAVORITES_TAB_THEMES[key].tabActive} hover:brightness-110`;
}

export function listStatusDropdownMenuItemClass(themeKey: ListStatusTab, active: boolean): string {
  const theme = FAVORITES_TAB_THEMES[themeKey];
  const layout = "mx-1 rounded-md";
  return active ? `${layout} ${theme.tabActive}` : `${layout} ${theme.tabInactive}`;
}
