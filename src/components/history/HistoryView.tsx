"use client";

import { Suspense, useEffect, useState } from "react";
import { RelativeTime } from "@/components/RelativeTime";
import { HistoryUpcomingSoonPanel } from "@/components/history/HistoryUpcomingSoonPanel";
import { HistoryWatchCard } from "@/components/history/HistoryWatchCard";
import { NotificationDiscoveryCta } from "@/components/notifications/NotificationDiscoveryCta";
import { NotificationsSettingsTab } from "@/components/settings/NotificationsSettingsTab";
import { useNotificationDiscovery } from "@/hooks/useNotificationDiscovery";
import { homeFeedGridClassName, homeFeedGutterX, homeHistoryOuterGutterX } from "@/lib/home-feed-layout";
import { watchHistoryItemToReleaseDto } from "@/lib/history-watch-card";
import type { HistoryUpcomingSoonItemDto } from "@/lib/history-upcoming-soon";
import type { WatchHistoryItemDto } from "@/lib/watch-history";

export const HISTORY_NOTIFICATIONS_SECTION_ID = "history-notifications-settings";

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

      {items.length === 0 ? (
        <div className={`${homeFeedGutterX} rounded-xl border border-border bg-card p-6 text-sm text-muted`}>
          Пока нет сохранённого прогресса. Начните смотреть аниме — позиция будет сохраняться автоматически.
        </div>
      ) : (
        <ul className={`${homeFeedGridClassName} ${homeFeedGutterX} md:overflow-visible`}>
          {items.map((item) => (
            <li key={item.shikimoriId} className="min-w-0">
              <HistoryWatchCardItem item={item} onDelete={handleDelete} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
