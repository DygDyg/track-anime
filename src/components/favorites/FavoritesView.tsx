"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { ListStatusBadge, ViewerListStatusBadge, useViewerListStatusAccent } from "@/components/favorites/ListStatusBadge";
import { useUserListStatusMap } from "@/components/favorites/UserListStatusProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { labelKind, labelStatus } from "@/lib/anime-labels";
import type { FavoriteAnimeItem, FavoritesAllData } from "@/lib/favorites-page";
import { shouldShowListBadge } from "@/lib/user-anime-list-status";
import { LIST_STATUS_LABELS, type ListStatusTab } from "@/lib/shikimori/user-rates";
import { FAVORITES_TAB_THEMES } from "@/components/favorites/favorites-tab-theme";

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

function tabHref(tab: ListStatusTab, basePath: string): string {
  return tab === "watching" ? basePath : `${basePath}?tab=${tab}`;
}

type ViewerListFilter = "all" | "viewer_has" | "viewer_missing";

const VIEWER_FILTER_OPTIONS: Array<{ value: ViewerListFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "viewer_has", label: "У вас есть" },
  { value: "viewer_missing", label: "У вас нет" },
];

function matchesViewerFilter(
  shikimoriId: number,
  filter: ViewerListFilter,
  getStatus: (id: number) => { listStatus: string | null; isBookmark: boolean } | null,
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
    <div className="mb-5 rounded-xl border border-border/80 bg-card/60 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Фильтр по вашим спискам</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Фильтр по вашим спискам">
        {VIEWER_FILTER_OPTIONS.map((option) => {
          const active = value === option.value;
          const disabled = loading && option.value !== "all";
          return (
            <label
              key={option.value}
              className={[
                "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
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
                className="h-4 w-4 shrink-0 accent-accent"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        Метка <span className="font-semibold text-foreground">«У вас · …»</span> и цветная полоска слева
        показывают категорию в вашем списке.
        {loading ? " Загружаем ваши списки…" : null}
      </p>
    </div>
  );
}

function FavoriteAnimeCard({
  item,
  activeTab,
  showViewerStatus = false,
}: {
  item: FavoriteAnimeItem;
  activeTab: ListStatusTab;
  showViewerStatus?: boolean;
}) {
  const kindLabel = labelKind(item.kind);
  const statusLabel = labelStatus(item.status);
  const showListBadge = Boolean(item.listStatus) || activeTab === "bookmarks" || activeTab === "all";
  const listInfo = item.listStatus
    ? { listStatus: item.listStatus, isBookmark: false }
    : showListBadge
      ? { listStatus: null, isBookmark: true }
      : null;
  const viewerAccent = useViewerListStatusAccent(item.shikimoriId, showViewerStatus);

  return (
    <AnimeLink
      href={`/anime/${item.shikimoriId}`}
      className={[
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/15 active:scale-[0.98]",
        viewerAccent ? `border-l-4 ${viewerAccent}` : "",
      ].join(" ")}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-dim">
        <AnimePoster
          src={item.posterUrl}
          shikimoriId={item.shikimoriId}
          alt={item.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {showListBadge ? (
          <ListStatusBadge info={listInfo} size="md" className="absolute left-1.5 top-1.5 z-10" />
        ) : null}
        {showViewerStatus ? (
          <ViewerListStatusBadge
            shikimoriId={item.shikimoriId}
            size="sm"
            className="absolute bottom-1.5 right-1.5 z-10"
          />
        ) : null}
        <AnimeScoreBadge
          score={item.userScore ?? item.score}
          className="absolute right-1.5 top-1.5"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug text-foreground group-hover:text-accent">
          {item.title}
        </h3>
        {item.titleOriginal ? (
          <p className="line-clamp-1 text-xs text-muted">{item.titleOriginal}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-1.5 text-[11px] text-muted">
          {item.watchedEpisodes ? <span>{item.watchedEpisodes} эп.</span> : null}
          {kindLabel ? <span>{kindLabel}</span> : null}
          {statusLabel ? <span>{statusLabel}</span> : null}
        </div>
      </div>
    </AnimeLink>
  );
}

type Props = FavoritesAllData & {
  initialTab: ListStatusTab;
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
  const { user } = useAuth();
  const { getStatus, loading: viewerListsLoading } = useUserListStatusMap();
  const [tab, setTab] = useState<ListStatusTab>(initialTab);
  const [search, setSearch] = useState("");
  const [viewerFilter, setViewerFilter] = useState<ViewerListFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tabBeforeSearchRef = useRef<ListStatusTab | null>(null);

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
        window.history.replaceState(null, "", tabHref(next, basePath));
      });
    },
    [search, basePath],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      const wasActive = search.trim().length > 0;
      const isActive = value.trim().length > 0;

      setSearch(value);

      if (isActive && !wasActive) {
        tabBeforeSearchRef.current = tab;
        setTab("all");
        window.history.replaceState(null, "", tabHref("all", basePath));
        return;
      }

      if (!isActive && wasActive && tabBeforeSearchRef.current) {
        const previous = tabBeforeSearchRef.current;
        tabBeforeSearchRef.current = null;
        setTab(previous);
        window.history.replaceState(null, "", tabHref(previous, basePath));
      }
    },
    [search, tab, basePath],
  );

  const clearSearch = useCallback(() => {
    handleSearchChange("");
  }, [handleSearchChange]);

  const searchActive = search.trim().length > 0;
  const displayTab: ListStatusTab = searchActive ? "all" : tab;
  const tabItems = tabs[displayTab] ?? [];
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
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

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {pageTitle ?? "Избранное"}
        </h1>
        <p className="mt-2 text-sm text-foreground/70 sm:text-base">
          {readOnly ? (
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
              {isRefreshing ? " · обновляем списки…" : ""}
            </>
          )}
        </p>
      </div>

      {!readOnly && sync.stale ? (
        <div
          className="mb-5 rounded-xl border border-amber-500/45 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-foreground"
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

      <div className="mb-5">
        <label htmlFor="favorites-search" className="sr-only">
          Поиск по избранному
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
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
            className="favorites-search-input h-11 w-full rounded-xl border border-border bg-card pl-11 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            autoComplete="off"
            spellCheck={false}
          />
          {search ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Очистить поиск"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
        {searchActive || viewerFilterActive ? (
          <p className="mt-2 text-sm font-medium text-foreground/80">
            Показано: {filteredItems.length} из {tabItems.length}
          </p>
        ) : null}
      </div>

      <div
        className="mb-6 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Категории избранного"
      >
        {TAB_ORDER.map((key) => {
          const count = counts[key] ?? 0;
          const active = displayTab === key;
          const label = LIST_STATUS_LABELS[key] ?? key;
          const theme = FAVORITES_TAB_THEMES[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(key)}
              className={[
                "favorites-tab shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition duration-150 active:scale-[0.97]",
                active ? ["favorites-tab-active", theme.tabActive].join(" ") : theme.tabInactive,
              ].join(" ")}
            >
              <span>{label}</span>
              {count > 0 ? (
                <span
                  className={[
                    "ml-2 inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold",
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

      <div
        key={displayTab}
        role="tabpanel"
        className={[
          "favorites-tab-panel",
          isPending ? "favorites-tab-panel-pending" : "",
        ].join(" ")}
      >
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredItems.map((item) => (
              <FavoriteAnimeCard
                key={`${item.shikimoriId}-${item.listStatus ?? "bookmark"}`}
                item={item}
                activeTab={displayTab}
                showViewerStatus={showViewerListStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
