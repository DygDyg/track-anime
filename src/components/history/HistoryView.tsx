"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { RelativeTime } from "@/components/RelativeTime";
import { FAVORITES_TAB_THEMES } from "@/components/favorites/favorites-tab-theme";
import { useUserListStatusMap } from "@/components/favorites/UserListStatusProvider";
import { HistoryUpcomingSoonPanel } from "@/components/history/HistoryUpcomingSoonPanel";
import { HistoryWatchCard } from "@/components/history/HistoryWatchCard";
import { NotificationDiscoveryCta } from "@/components/notifications/NotificationDiscoveryCta";
import { NotificationsSettingsTab } from "@/components/settings/NotificationsSettingsTab";
import { useNotificationDiscovery } from "@/hooks/useNotificationDiscovery";
import { homeFeedGridClassName, homeFeedGutterX, homeHistoryOuterGutterX } from "@/lib/home-feed-layout";
import { watchHistoryItemToReleaseDto } from "@/lib/history-watch-card";
import type { HistoryUpcomingSoonItemDto } from "@/lib/history-upcoming-soon";
import { LIST_STATUS_LABELS, LIST_STATUS_LABELS_MOBILE } from "@/lib/shikimori/user-rates";
import type { WatchHistoryItemDto } from "@/lib/watch-history";

export const HISTORY_NOTIFICATIONS_SECTION_ID = "history-notifications-settings";

/** Вкладки фильтра истории по статусу списка Shikimori. */
type HistoryListFilterTab = "active" | "completed" | "on_hold" | "dropped";

const HISTORY_LIST_FILTER_TABS: Array<{
  key: HistoryListFilterTab;
  label: string;
  labelMobile: string;
  themeKey: "watching" | "completed" | "on_hold" | "dropped";
}> = [
  {
    key: "active",
    label: "Актуальные",
    labelMobile: "Актуал.",
    themeKey: "watching",
  },
  {
    key: "completed",
    label: LIST_STATUS_LABELS.completed,
    labelMobile: LIST_STATUS_LABELS_MOBILE.completed,
    themeKey: "completed",
  },
  {
    key: "on_hold",
    label: LIST_STATUS_LABELS.on_hold,
    labelMobile: LIST_STATUS_LABELS_MOBILE.on_hold,
    themeKey: "on_hold",
  },
  {
    key: "dropped",
    label: LIST_STATUS_LABELS.dropped,
    labelMobile: LIST_STATUS_LABELS_MOBILE.dropped,
    themeKey: "dropped",
  },
];

function matchesHistoryListFilter(
  listStatus: string | null | undefined,
  tab: HistoryListFilterTab,
): boolean {
  if (tab === "completed") return listStatus === "completed";
  if (tab === "on_hold") return listStatus === "on_hold";
  if (tab === "dropped") return listStatus === "dropped";
  // Актуальные: всё, кроме отдельных вкладок
  return listStatus !== "completed" && listStatus !== "on_hold" && listStatus !== "dropped";
}

function formatAddedLabel(createdAt: string): string {
  const created = new Date(createdAt);
  const diffMs = Date.now() - created.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (days >= 7) {
    return created.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: created.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  }

  if (days >= 1) {
    const mod10 = days % 10;
    const mod100 = days % 100;
    let word = "дней";
    if (mod10 === 1 && mod100 !== 11) word = "день";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "дня";
    return `${days} ${word} назад`;
  }

  return "";
}

function HistoryAddedAt({ createdAt }: { createdAt: string }) {
  const longLabel = formatAddedLabel(createdAt);

  return (
    <p className="text-sm font-semibold text-foreground md:text-base">
      {longLabel ? (
        <>Добавлено {longLabel}</>
      ) : (
        <>
          Добавлено <RelativeTime date={createdAt} />
        </>
      )}
    </p>
  );
}

function HistoryWatchCardItem({
  item,
  onDelete,
}: {
  item: WatchHistoryItemDto;
  onDelete: (shikimoriId: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = window.confirm(`Удалить «${item.animeTitle}» из истории?`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/user/watch-history/${item.shikimoriId}`, { method: "DELETE" });
      if (!res.ok) return;
      onDelete(item.shikimoriId);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <HistoryWatchCard
      release={watchHistoryItemToReleaseDto(item)}
      progress={{
        watchedEpisodeNumber: item.episodeNumber,
        watchProgressPercent: item.watchProgressPercent,
        watchPositionSeconds: item.positionSeconds,
        watchDurationSeconds: item.episodeDurationSeconds,
        isBookmark: item.isBookmark,
      }}
      footer={<HistoryAddedAt createdAt={item.createdAt} />}
      animeHref={`/anime/${item.shikimoriId}#player`}
      hoverPanelPortal
      onDelete={() => void handleDelete()}
      deleting={deleting}
    />
  );
}

function HistoryNotificationsSection() {
  return (
    <section
      id={HISTORY_NOTIFICATIONS_SECTION_ID}
      className="mb-6 rounded-xl border border-border bg-card px-3 py-3 sm:px-4 sm:py-4"
    >
      <Suspense fallback={<p className="text-sm text-muted">Загрузка настроек…</p>}>
        <NotificationsSettingsTab variant="compact" />
      </Suspense>
    </section>
  );
}

export function HistoryView({
  initialItems,
  upcomingSoon,
}: {
  initialItems: WatchHistoryItemDto[];
  upcomingSoon: HistoryUpcomingSoonItemDto[];
}) {
  const [items, setItems] = useState(initialItems);
  const [listFilter, setListFilter] = useState<HistoryListFilterTab>("active");
  const { getStatus, loading: listsLoading } = useUserListStatusMap();
  const { shouldShowCta, dismissCta, markTabSeen } = useNotificationDiscovery();

  useEffect(() => {
    markTabSeen();
  }, [markTabSeen]);

  const scrollToNotifications = () => {
    document.getElementById(HISTORY_NOTIFICATIONS_SECTION_ID)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleDelete = (shikimoriId: number) => {
    setItems((current) => current.filter((item) => item.shikimoriId !== shikimoriId));
  };

  const filterCounts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let onHold = 0;
    let dropped = 0;
    for (const item of items) {
      const status = getStatus(item.shikimoriId)?.listStatus ?? null;
      if (status === "completed") completed += 1;
      else if (status === "on_hold") onHold += 1;
      else if (status === "dropped") dropped += 1;
      else active += 1;
    }
    return { active, completed, on_hold: onHold, dropped };
  }, [items, getStatus]);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesHistoryListFilter(getStatus(item.shikimoriId)?.listStatus, listFilter),
    );
  }, [items, getStatus, listFilter]);

  const emptyMessage =
    items.length === 0
      ? "Пока нет сохранённого прогресса. Начните смотреть аниме — позиция будет сохраняться автоматически."
      : listFilter === "completed"
        ? "В истории нет аниме из категории «Просмотрено»."
        : listFilter === "on_hold"
          ? "В истории нет аниме из категории «Отложено»."
          : listFilter === "dropped"
            ? "В истории нет аниме из категории «Брошено»."
            : "Нет актуальных записей — всё из истории сейчас в «Просмотрено», «Отложено» или «Брошено».";

  return (
    <div className="py-6 sm:py-8">
      <div className={`${homeFeedGutterX} mb-6`}>
        <h1 className="text-2xl font-bold text-foreground">История</h1>
      </div>

      {shouldShowCta && items.length > 0 ? (
        <div className={`${homeHistoryOuterGutterX} mb-6`}>
          <NotificationDiscoveryCta
            onConfigure={scrollToNotifications}
            onDismiss={dismissCta}
          />
        </div>
      ) : null}

      <div className={`${homeHistoryOuterGutterX} mb-6`}>
        <HistoryNotificationsSection />
      </div>

      <div className="mb-6 sm:mb-8">
        <HistoryUpcomingSoonPanel items={upcomingSoon} />
      </div>

      {items.length > 0 ? (
        <div className={`${homeFeedGutterX} mb-4 sm:mb-5`}>
          <div
            className="flex flex-wrap gap-1.5 sm:gap-2"
            role="tablist"
            aria-label="Фильтр истории по спискам"
          >
            {HISTORY_LIST_FILTER_TABS.map((tab) => {
              const active = listFilter === tab.key;
              const theme = FAVORITES_TAB_THEMES[tab.themeKey];
              const count = filterCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setListFilter(tab.key)}
                  className={[
                    "rounded-lg px-2.5 py-2 text-[11px] font-bold leading-tight transition duration-150 active:scale-[0.97] sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm",
                    active ? theme.tabActive : theme.tabInactive,
                  ].join(" ")}
                >
                  <span className="sm:hidden">{tab.labelMobile}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {!listsLoading && count > 0 ? (
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
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div className={`${homeFeedGutterX} rounded-xl border border-border bg-card p-6 text-sm text-muted`}>
          {emptyMessage}
        </div>
      ) : (
        <ul className={`${homeFeedGridClassName} ${homeFeedGutterX} md:overflow-visible`}>
          {filteredItems.map((item) => (
            <li key={item.shikimoriId} className="min-w-0">
              <HistoryWatchCardItem item={item} onDelete={handleDelete} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
