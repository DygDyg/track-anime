"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimeCardHoverShell } from "@/components/AnimeCardHoverShell";
import { AnimeKindCornerBadge } from "@/components/AnimeKindCornerBadge";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { ListStatusBadge, ViewerListStatusBadge, useViewerListStatusAccent } from "@/components/favorites/ListStatusBadge";
import { FavoriteRewatchBadge } from "@/components/favorites/FavoriteRewatchBadge";
import { useUserListStatusMap } from "@/components/favorites/UserListStatusProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { labelKind, labelStatus } from "@/lib/anime-labels";
import type { FavoriteAnimeItem, FavoritesAllData, FavoritesSortMode } from "@/lib/favorites-page";
import { parseFavoritesSort, parseFavoritesTab, sortFavoriteItems } from "@/lib/favorites-page";
import { shouldShowListBadge, type UserAnimeListInfo } from "@/lib/user-anime-list-status";
import { LIST_STATUS_LABELS, LIST_STATUS_LABELS_MOBILE, type ListStatusTab } from "@/lib/shikimori/user-rates";
import { FAVORITES_TAB_THEMES } from "@/components/favorites/favorites-tab-theme";
import { favoriteToHoverRelease } from "@/lib/hover-panel-release";
import { consumeNavReturn, restoreScrollY } from "@/lib/navigation-return";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoading";
import { homeFeedGridClassName, homeFeedGutterX } from "@/lib/home-feed-layout";

const TAB_ORDER: ListStatusTab[] = [
  "watching",
  "planned",
  "completed",
  "on_hold",
  "dropped",
  "rewatching",
  "bookmarks",
  "all",
];

function matchesSearch(item: FavoriteAnimeItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    (item.titleOriginal?.toLowerCase().includes(q) ?? false)
  );
}

function tabHref(tab: ListStatusTab, basePath: string, sort: FavoritesSortMode): string {
  const params = new URLSearchParams();
  if (tab !== "watching") params.set("tab", tab);
  if (sort === "added") params.set("sort", "added");
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

type ViewerListFilter = "all" | "viewer_has" | "viewer_missing";

const VIEWER_FILTER_OPTIONS: Array<{ value: ViewerListFilter; label: string; labelMobile: string }> = [
  { value: "all", label: "Все", labelMobile: "Все" },
  { value: "viewer_has", label: "У вас есть", labelMobile: "Есть" },
  { value: "viewer_missing", label: "У вас нет", labelMobile: "Нет" },
];

function matchesViewerFilter(
  shikimoriId: number,
  filter: ViewerListFilter,
  getStatus: (id: number) => UserAnimeListInfo | null,
): boolean {
  if (filter === "all") return true;
  const inViewerList = shouldShowListBadge(getStatus(shikimoriId));
  return filter === "viewer_has" ? inViewerList : !inViewerList;
}

function ViewerListFilterBar({
  value,
  onChange,
  loading,
}: {
  value: ViewerListFilter;
  onChange: (next: ViewerListFilter) => void;
  loading: boolean;
}) {
  return (
    <div className="mb-4 rounded-xl border border-border/80 bg-card/60 px-3 py-2.5 sm:mb-5 sm:px-4 sm:py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:text-xs">
        Ваши списки
      </p>
      <div
        className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2"
        role="radiogroup"
        aria-label="Фильтр по вашим спискам"
      >
        {VIEWER_FILTER_OPTIONS.map((option) => {
          const active = value === option.value;
          const disabled = loading && option.value !== "all";
          return (
            <label
              key={option.value}
              className={[
                "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition sm:justify-start sm:px-3 sm:text-sm",
                active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-background/60 text-foreground hover:border-accent/40",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <input
                type="radio"
                name="viewer-list-filter"
                value={option.value}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="sr-only sm:not-sr-only sm:h-4 sm:w-4 sm:shrink-0 sm:accent-accent"
              />
              <span className="sm:hidden">{option.labelMobile}</span>
              <span className="hidden sm:inline">{option.label}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 hidden text-xs text-muted sm:block">
        Метка <span className="font-semibold text-foreground">«У вас · …»</span> и цветная полоска слева
        показывают категорию в вашем списке.
        {loading ? " Загружаем ваши списки…" : null}
      </p>
      {loading ? (
        <p className="mt-1.5 text-[11px] text-muted sm:hidden">Загружаем ваши списки…</p>
      ) : null}
    </div>
  );
}

function FavoriteAnimeCard({
  item,
  activeTab,
  showViewerStatus = false,
  readOnly = false,
}: {
  item: FavoriteAnimeItem;
  activeTab: ListStatusTab;
  showViewerStatus?: boolean;
  readOnly?: boolean;
}) {
  const kindLabel = labelKind(item.kind);
  const statusLabel = labelStatus(item.status);
  const tabMatchesList =
    Boolean(item.listStatus) &&
    activeTab !== "all" &&
    activeTab !== "bookmarks" &&
    item.listStatus === activeTab;
  const showListBadge =
    !tabMatchesList &&
    (Boolean(item.listStatus) || activeTab === "bookmarks" || activeTab === "all");
  const listInfo = item.listStatus
    ? {
        listStatus: item.listStatus,
        isBookmark: false,
        rewatches: item.rewatches,
        userScore: item.userScore,
      }
    : showListBadge
      ? { listStatus: null, isBookmark: true, rewatches: null, userScore: null }
      : null;
  const viewerAccent = useViewerListStatusAccent(item.shikimoriId, showViewerStatus);

  const metaItems = [
    item.watchedEpisodes ? `${item.watchedEpisodes} эп.` : null,
    kindLabel,
    statusLabel,
  ].filter(Boolean);
  const hoverRelease = favoriteToHoverRelease(item);

  return (
    <AnimeCardHoverShell release={hoverRelease} previewUrl={item.posterUrl} readOnly={readOnly}>
      <AnimeLink
        href={`/anime/${item.shikimoriId}`}
        className={[
          "group relative z-10 flex gap-3 overflow-hidden rounded-lg border border-border bg-card p-2 transition duration-200 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/15 active:scale-[0.99]",
          "md:flex-col md:gap-0 md:rounded-xl md:p-0 md:hover:-translate-y-0.5 md:active:scale-[0.98]",
          viewerAccent ? `border-l-4 ${viewerAccent}` : "",
        ].join(" ")}
      >
      <div className="relative w-[88px] shrink-0 overflow-hidden rounded-md bg-surface-dim sm:w-[96px] md:w-full md:shrink-0 md:rounded-none">
        <div className="aspect-[3/4] h-full w-full">
          <AnimePoster
            src={item.posterUrl}
            shikimoriId={item.shikimoriId}
            alt={item.title}
            size="thumb"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>
        {showListBadge ? (
          <ListStatusBadge
            info={listInfo}
            size="sm"
            className="absolute left-1 top-1 z-10 max-w-[calc(100%-2rem)] md:left-1.5 md:top-1.5"
          />
        ) : null}
        {showViewerStatus ? (
          <ViewerListStatusBadge
            shikimoriId={item.shikimoriId}
            size="sm"
            className="absolute bottom-1 right-1 z-10 md:bottom-1.5 md:right-1.5"
          />
        ) : null}
        <AnimeScoreBadge
          score={item.userScore ?? item.score}
          className="absolute right-1 top-1 md:right-1.5 md:top-1.5"
        />
        <AnimeKindCornerBadge kind={item.kind} className="absolute bottom-0 left-0 z-10" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5 md:justify-start md:gap-0 md:p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-accent md:line-clamp-3 md:min-h-[3.75rem]">
          {item.title}
        </h3>
        {item.titleOriginal ? (
          <p className="line-clamp-1 text-xs text-muted">{item.titleOriginal}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-0.5 text-[10px] text-muted md:gap-1.5 md:pt-0 md:text-[11px]">
          <FavoriteRewatchBadge
            shikimoriId={item.shikimoriId}
            listStatus={item.listStatus}
            rewatches={item.rewatches}
            readOnly={readOnly}
            className="max-w-full truncate text-[10px] md:text-[11px]"
          />
          {metaItems.map((meta) => (
            <span key={meta}>{meta}</span>
          ))}
        </div>
      </div>
      </AnimeLink>
    </AnimeCardHoverShell>
  );
}

type Props = FavoritesAllData & {
  initialTab: ListStatusTab;
  initialSort?: FavoritesSortMode;
  nickname: string;
  basePath?: string;
  readOnly?: boolean;
  dataSource?: "site" | "shikimori";
  backHref?: string;
  pageTitle?: string;
  showViewerListStatus?: boolean;
};

export function FavoritesView({
  tabs,
  counts,
  mangaBookmarkCount,
  initialTab,
  initialSort = "updated",
  nickname,
  sync,
  shouldBackgroundSync,
  basePath = "/favorites",
  readOnly = false,
  dataSource = "site",
  backHref,
  pageTitle,
  showViewerListStatus = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { getStatus, loading: viewerListsLoading } = useUserListStatusMap();
  const [tab, setTab] = useState<ListStatusTab>(initialTab);
  const [sortMode, setSortMode] = useState<FavoritesSortMode>(initialSort);
  const [listInverted, setListInverted] = useState(false);
  const [search, setSearch] = useState("");
  const [viewerFilter, setViewerFilter] = useState<ViewerListFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tabBeforeSearchRef = useRef<ListStatusTab | null>(null);
  const navRestoreDoneRef = useRef(false);

  /** URL — источник правды для вкладки (важно при router.back() с ?tab=). */
  useLayoutEffect(() => {
    if (!window.location.pathname.startsWith(basePath)) return;

    const params = new URLSearchParams(window.location.search);
    setTab(parseFavoritesTab(params.get("tab") ?? undefined));
    setSortMode(parseFavoritesSort(params.get("sort") ?? undefined));
  }, [basePath, searchParams]);

  useLayoutEffect(() => {
    if (navRestoreDoneRef.current) return;

    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.startsWith(basePath)) return;

    const nav = consumeNavReturn(currentPath, { samePathname: true });
    if (!nav) return;

    navRestoreDoneRef.current = true;
    restoreScrollY(nav.scrollY);
  }, [basePath, searchParams]);

  useEffect(() => {
    if (readOnly || !shouldBackgroundSync || sync.error) return;

    let cancelled = false;
    setIsRefreshing(true);

    void fetch("/api/favorites/sync", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return;
        if (!cancelled) router.refresh();
      })
      .finally(() => {
        if (!cancelled) setIsRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [readOnly, shouldBackgroundSync, sync.error, router]);

  const switchTab = useCallback(
    (next: ListStatusTab) => {
      startTransition(() => {
        if (search.trim()) {
          setSearch("");
          tabBeforeSearchRef.current = null;
        }
        setTab(next);
        router.replace(tabHref(next, basePath, sortMode), { scroll: false });
      });
    },
    [search, basePath, sortMode, router],
  );

  const switchSort = useCallback(
    (next: FavoritesSortMode) => {
      setSortMode(next);
      router.replace(tabHref(tab, basePath, next), { scroll: false });
    },
    [tab, basePath, router],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      const wasActive = search.trim().length > 0;
      const isActive = value.trim().length > 0;

      setSearch(value);

      if (isActive && !wasActive) {
        tabBeforeSearchRef.current = tab;
        setTab("all");
        router.replace(tabHref("all", basePath, sortMode), { scroll: false });
        return;
      }

      if (!isActive && wasActive && tabBeforeSearchRef.current) {
        const previous = tabBeforeSearchRef.current;
        tabBeforeSearchRef.current = null;
        setTab(previous);
        router.replace(tabHref(previous, basePath, sortMode), { scroll: false });
      }
    },
    [search, tab, basePath, sortMode, router],
  );

  const clearSearch = useCallback(() => {
    handleSearchChange("");
  }, [handleSearchChange]);

  const searchActive = search.trim().length > 0;
  const displayTab: ListStatusTab = searchActive ? "all" : tab;
  const tabItems = useMemo(() => {
    const items = tabs[displayTab] ?? [];
    const sorted =
      displayTab === "bookmarks" ? [...items] : sortFavoriteItems(items, sortMode);
    return listInverted ? sorted.reverse() : sorted;
  }, [tabs, displayTab, sortMode, listInverted]);
  const filteredItems = useMemo(() => {
    return tabItems
      .filter((item) => matchesSearch(item, search))
      .filter((item) =>
        showViewerListStatus && user
          ? matchesViewerFilter(item.shikimoriId, viewerFilter, getStatus)
          : true,
      );
  }, [tabItems, search, showViewerListStatus, user, viewerFilter, getStatus]);

  const viewerFilterActive = showViewerListStatus && user && viewerFilter !== "all";

  function formatSyncDate(date: Date | null): string {
    if (!date) return "неизвестно";
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function formatSyncDateShort(date: Date | null): string {
    if (!date) return "";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
  }

  const syncSubtitleFull = readOnly ? (
    <>
      {dataSource === "shikimori" ? "Списки с Shikimori" : "Списки пользователя"}
      {nickname ? `: ${nickname}` : ""}
      {mangaBookmarkCount > 0 ? ` · манга в закладках: ${mangaBookmarkCount}` : ""}
      {sync.syncedAt ? ` · обновлено ${formatSyncDate(sync.syncedAt)}` : ""}
    </>
  ) : (
    <>
      Синхронизация с Shikimori{nickname ? ` — ${nickname}` : ""}
      {mangaBookmarkCount > 0 ? ` · манга в закладках: ${mangaBookmarkCount}` : ""}
      {!sync.stale && sync.syncedAt ? ` · обновлено ${formatSyncDate(sync.syncedAt)}` : ""}
      {isRefreshing ? (
        <>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <LoadingSpinner size="xs" />
            обновляем списки…
          </span>
        </>
      ) : (
        ""
      )}
    </>
  );

  const syncSubtitleMobile = readOnly ? (
    <>
      {nickname || "Пользователь"}
      {sync.syncedAt ? ` · ${formatSyncDateShort(sync.syncedAt)}` : ""}
    </>
  ) : (
    <>
      {nickname || "Shikimori"}
      {isRefreshing ? (
        <>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <LoadingSpinner size="xs" />
            обновление…
          </span>
        </>
      ) : (
        sync.syncedAt && !sync.stale ? ` · ${formatSyncDateShort(sync.syncedAt)}` : null
      )}
    </>
  );

  return (
    <div className={`${homeFeedGutterX} py-4 sm:py-8`}>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-accent"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Назад к профилю
        </Link>
      ) : null}

      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-3xl">
          {pageTitle ?? "Избранное"}
        </h1>
        <p className="mt-1.5 text-xs text-muted sm:hidden">{syncSubtitleMobile}</p>
        <p className="mt-2 hidden text-sm text-foreground/70 sm:block sm:text-base">{syncSubtitleFull}</p>
      </div>

      {!readOnly && sync.stale ? (
        <div
          className="mb-4 rounded-xl border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-foreground sm:mb-5 sm:px-4 sm:py-3"
          role="status"
        >
          {sync.error ? (
            <>
              <p className="font-semibold text-amber-200 dark:text-amber-100">Показана локальная копия</p>
              <p className="mt-1 text-foreground/85">
                Shikimori сейчас недоступен
                {sync.syncedAt ? ` — данные от ${formatSyncDate(sync.syncedAt)}` : ""}. Списки сохранены на
                сервере и обновятся при следующей успешной синхронизации.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-200 dark:text-amber-100">Обновляем списки с Shikimori</p>
              <p className="mt-1 text-foreground/85">
                Страница открыта из локальной копии
                {sync.syncedAt ? ` (${formatSyncDate(sync.syncedAt)})` : ""}. Список обновится автоматически.
              </p>
            </>
          )}
        </div>
      ) : null}

      {readOnly && !sync.syncedAt ? (
        <div
          className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground/85"
          role="status"
        >
          У этого пользователя пока нет сохранённых списков на Track Anime.
        </div>
      ) : null}

      {showViewerListStatus && user ? (
        <ViewerListFilterBar
          value={viewerFilter}
          onChange={setViewerFilter}
          loading={viewerListsLoading}
        />
      ) : showViewerListStatus ? (
        <p className="mb-5 rounded-xl border border-border/80 bg-card/60 px-4 py-3 text-sm text-muted">
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Войдите
          </Link>
          , чтобы сравнивать этот список со своим и фильтровать по «у вас есть / нет».
        </p>
      ) : null}

      <section className="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4">
        <div
          className={[
            "favorites-mobile-tabbar site-panel relative order-1 grid grid-cols-4 gap-1.5 sm:order-3 sm:flex sm:flex-wrap sm:gap-2",
            "sticky top-[var(--site-header-height)] z-40 -mx-3 px-3 py-2 backdrop-blur-lg backdrop-saturate-150",
            "max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-border/90 max-md:bg-transparent",
            "md:static md:mx-0 md:p-3 md:backdrop-blur-none",
          ].join(" ")}
          role="tablist"
          aria-label="Категории избранного"
        >
          <div
            aria-hidden
            className="site-header-bg pointer-events-none absolute inset-0 -z-10 border-b border-border/90 md:hidden"
          />
          {TAB_ORDER.map((key) => {
            const count = counts[key] ?? 0;
            const active = displayTab === key;
            const theme = FAVORITES_TAB_THEMES[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                className={[
                  "favorites-tab w-full rounded-lg px-2 py-2 text-[11px] font-bold leading-tight transition duration-150 active:scale-[0.97] sm:w-auto sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm",
                  active ? ["favorites-tab-active", theme.tabActive].join(" ") : theme.tabInactive,
                ].join(" ")}
              >
                <span className="sm:hidden">{LIST_STATUS_LABELS_MOBILE[key] ?? key}</span>
                <span className="hidden sm:inline">{LIST_STATUS_LABELS[key] ?? key}</span>
                {count > 0 ? (
                  <span
                    className={[
                      "ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold sm:ml-2 sm:min-w-[1.35rem] sm:px-1.5 sm:text-xs",
                      active ? theme.countActive : theme.countInactive,
                    ].join(" ")}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="order-2 sm:order-1">
          <label htmlFor="favorites-search" className="sr-only">
            Поиск по избранному
          </label>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted sm:left-3.5 sm:h-5 sm:w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" strokeLinecap="round" />
            </svg>
            <input
              id="favorites-search"
              type="search"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Поиск по названию…"
              className="favorites-search-input h-10 w-full rounded-xl border border-border bg-card pl-10 pr-9 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 sm:h-11 sm:pl-11 sm:pr-10"
              autoComplete="off"
              spellCheck={false}
            />
            {search ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-foreground/5 hover:text-foreground sm:right-2 sm:h-8 sm:w-8"
                aria-label="Очистить поиск"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
          {searchActive || viewerFilterActive ? (
            <p className="mt-1.5 text-xs font-medium text-foreground/80 sm:mt-2 sm:text-sm">
              Показано: {filteredItems.length} из {tabItems.length}
            </p>
          ) : null}
        </div>

        <div className="order-3 grid grid-cols-2 gap-1.5 sm:order-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          {displayTab !== "bookmarks" ? (
            <>
              <span className="col-span-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:col-auto sm:text-xs">
                Сортировка
              </span>
              <button
                type="button"
                onClick={() => switchSort("updated")}
                className={[
                  "rounded-lg border px-2.5 py-2 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm",
                  sortMode === "updated"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-background/60 text-foreground hover:border-accent/40",
                ].join(" ")}
              >
                <span className="sm:hidden">Изменение</span>
                <span className="hidden sm:inline">По изменению</span>
              </button>
              <button
                type="button"
                onClick={() => switchSort("added")}
                className={[
                  "rounded-lg border px-2.5 py-2 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm",
                  sortMode === "added"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-background/60 text-foreground hover:border-accent/40",
                ].join(" ")}
              >
                <span className="sm:hidden">Добавление</span>
                <span className="hidden sm:inline">По добавлению</span>
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setListInverted((value) => !value)}
            aria-pressed={listInverted}
            className={[
              "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm",
              displayTab === "bookmarks" ? "col-span-2" : "",
              listInverted
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-background/60 text-foreground hover:border-accent/40",
            ].join(" ")}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M7 4v16M17 20V4" strokeLinecap="round" />
              <path d="M4 7l3-3 3 3M20 17l-3 3-3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sm:hidden">Инверт.</span>
            <span className="hidden sm:inline">Инвертировать списки</span>
          </button>
        </div>
      </section>

      <div
        key={displayTab}
        role="tabpanel"
        aria-busy={isPending}
        className={[
          "relative",
          "favorites-tab-panel",
          isPending ? "favorites-tab-panel-pending" : "",
        ].join(" ")}
      >
        {isPending ? <BrandLoadingOverlay /> : null}
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-lg shadow-black/20">
            <p className="text-base font-medium text-foreground/90">
              {searchActive
                ? `По запросу «${search.trim()}» ничего не найдено`
                : viewerFilter === "viewer_has"
                  ? "В этом разделе нет аниме, которые есть у вас в списках."
                  : viewerFilter === "viewer_missing"
                    ? "В этом разделе всё уже есть у вас в списках."
                    : displayTab === "bookmarks"
                      ? "В закладках Shikimori пока нет аниме."
                      : "В этом разделе списка пока ничего нет."}
            </p>
            {searchActive || viewerFilterActive ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {searchActive ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 active:scale-[0.98]"
                  >
                    Сбросить поиск
                  </button>
                ) : null}
                {viewerFilterActive ? (
                  <button
                    type="button"
                    onClick={() => setViewerFilter("all")}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim active:scale-[0.98]"
                  >
                    Показать все
                  </button>
                ) : null}
              </div>
            ) : displayTab === "bookmarks" ? (
              <p className="mt-3 text-sm text-muted">
                Закладки — отдельная функция Shikimori. Списки «Смотрю», «Просмотрено» и др. — во вкладках
                выше.
              </p>
            ) : null}
          </div>
        ) : (
          <div className={`${homeFeedGridClassName} md:overflow-visible`}>
            {filteredItems.map((item) => (
              <FavoriteAnimeCard
                key={`${item.shikimoriId}-${item.listStatus ?? "bookmark"}`}
                item={item}
                activeTab={displayTab}
                showViewerStatus={showViewerListStatus}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
