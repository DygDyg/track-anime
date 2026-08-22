"use client";

import { useEffect, useState } from "react";
import { RelativeTime } from "@/components/RelativeTime";
import { HistoryWatchCard } from "@/components/history/HistoryWatchCard";
import { headerControl } from "@/components/header/header-styles";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  readHomeUpcomingSoonCollapsed,
  writeHomeUpcomingSoonCollapsed,
} from "@/lib/site-settings";
import {
  homeFeedGridClassName,
  homeHistoryInnerPadX,
  homeHistoryOuterGutterX,
} from "@/lib/home-feed-layout";
import {
  HISTORY_UPCOMING_CYCLE_DAYS,
  HISTORY_UPCOMING_SOON_HOURS,
  type HistoryUpcomingSoonItemDto,
} from "@/lib/history-upcoming-soon";

function SoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={[
        "h-5 w-5 shrink-0 text-muted transition-transform duration-200",
        collapsed ? "-rotate-90" : "rotate-0",
      ].join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function formatCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} тайтл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} тайтла`;
  return `${count} тайтлов`;
}

export function HistoryUpcomingSoonPanel({ items }: { items: HistoryUpcomingSoonItemDto[] }) {
  const { settings } = useSiteSettings();
  const empty = items.length === 0;
  const [collapsed, setCollapsed] = useState(empty);
  const [collapseReady, setCollapseReady] = useState(false);
  const bodyId = "history-upcoming-soon-body";

  useEffect(() => {
    setCollapsed(readHomeUpcomingSoonCollapsed(empty));
    setCollapseReady(true);
  }, [empty]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      writeHomeUpcomingSoonCollapsed(next);
      return next;
    });
  };

  return (
    <div className={homeHistoryOuterGutterX}>
      <section
        className="home-history-section relative rounded-xl border border-border"
        aria-labelledby="history-upcoming-soon-title"
      >
        <div
          aria-hidden
          className={[
            "site-header-bg pointer-events-none absolute inset-0 overflow-hidden rounded-xl backdrop-blur-lg backdrop-saturate-150",
            collapsed ? "hidden" : "",
          ].join(" ")}
        />

        <div
          className={`site-header-text relative flex h-14 items-center gap-2 sm:h-16 sm:gap-2.5 ${homeHistoryInnerPadX} ${
            collapsed ? "bg-card" : "border-b border-border"
          }`}
        >
          <button
            type="button"
            className={`${headerControl.text} min-w-0 flex-1 justify-start gap-2 px-0 sm:gap-2.5`}
            aria-expanded={collapseReady ? !collapsed : undefined}
            aria-controls={bodyId}
            onClick={toggleCollapsed}
          >
            <CollapseChevron collapsed={collapsed} />
            <span className={`${headerControl.icon} pointer-events-none shrink-0 text-accent`}>
              <SoonIcon />
            </span>
            <span
              id="history-upcoming-soon-title"
              className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base"
            >
              Скоро выйдут
            </span>
            <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">
              ({formatCountLabel(items.length)})
            </span>
          </button>
        </div>

        {!collapsed ? (
          <div
            id={bodyId}
            className={`site-header-text relative bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
          >
            {empty ? (
              <p className="text-sm text-muted">
                В ближайшие {HISTORY_UPCOMING_SOON_HOURS} часов из вашей истории ничего не ожидается
                (оценка: +{HISTORY_UPCOMING_CYCLE_DAYS} дней после последней серии в вашей озвучке).
              </p>
            ) : (
              <div className={homeFeedGridClassName}>
                {items.map((item) => (
                  <HistoryWatchCard
                    key={item.id}
                    release={item}
                    progress={{
                      watchedEpisodeNumber: item.watchedEpisodeNumber,
                      watchProgressPercent: item.watchedProgressPercent,
                      watchPositionSeconds: item.watchedPositionSeconds,
                      watchDurationSeconds: item.watchedEpisodeDurationSeconds,
                    }}
                    footer={
                      <RelativeTime
                        date={item.scheduleAt}
                        mode={settings.showRelativeTime ? "relative" : "absolute"}
                        className="text-sm font-semibold text-foreground md:text-base"
                      />
                    }
                    animeHref={item.shikimoriId ? `/anime/${item.shikimoriId}` : undefined}
                    hoverPanelPortal
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
