"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReleaseCard } from "@/components/ReleaseCard";
import { headerControl } from "@/components/header/header-styles";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { homeFeedGridClassName, homeHistoryInnerPadX, homeHistoryOuterGutterX } from "@/lib/home-feed-layout";
import {
  isHomeTranslationVisible,
  readHomeHistoryCollapsed,
  readStoredSiteSettings,
  writeHomeHistoryCollapsed,
} from "@/lib/site-settings";
import type { ReleaseItemDto } from "@/lib/releases";

export type HistoryNewEpisodeDto = ReleaseItemDto & {
  watchedSeasonNumber: number;
  watchedEpisodeNumber: number;
};

function formatWatchedLabel(season: number, episode: number): string {
  if (season > 1) {
    return `Вы остановились на S${season}E${episode}`;
  }
  return `Вы остановились на серии ${episode}`;
}

function HistoryIcon() {
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

export function HistoryNewEpisodesSection({ items }: { items: HistoryNewEpisodeDto[] }) {
  const { settings } = useSiteSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);

  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        isHomeTranslationVisible(item.translationName, settings.homeTranslationFilter),
      ),
    [items, settings.homeTranslationFilter],
  );

  useEffect(() => {
    const stored = readStoredSiteSettings();
    setCollapsed(readHomeHistoryCollapsed(stored.homeHistoryCollapsedByDefault));
    setCollapseReady(true);
  }, []);

  if (visibleItems.length === 0) return null;

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      writeHomeHistoryCollapsed(next);
      return next;
    });
  };

  const bodyId = "home-history-panel-body";

  return (
    <div className={`${homeHistoryOuterGutterX} mb-6 sm:mb-8`}>
      <section
        className="home-history-section relative rounded-xl border border-border/90"
        aria-labelledby="home-history-panel-title"
      >
        <div
          aria-hidden
          className="site-header-bg pointer-events-none absolute inset-0 overflow-hidden rounded-xl backdrop-blur-lg backdrop-saturate-150"
        />

        <div
          className={`site-header-text relative flex h-14 items-center justify-between gap-2 sm:h-16 sm:gap-2.5 ${homeHistoryInnerPadX} ${
            collapsed ? "" : "border-b border-border/90"
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
              <HistoryIcon />
            </span>
            <span
              id="home-history-panel-title"
              className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base"
            >
              Новое в вашей истории
            </span>
            <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">
              ({formatCountLabel(visibleItems.length)})
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/history"
              className={`${headerControl.textMuted} hidden text-xs sm:inline-flex sm:text-sm`}
              onClick={(event) => event.stopPropagation()}
            >
              История
            </Link>
          </div>
        </div>

        {!collapsed ? (
          <div
            id={bodyId}
            className={`site-header-text relative border-t border-border/90 bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
          >
            <p className="mb-3 text-xs text-muted sm:hidden">
              <Link href="/history" className="text-foreground/80 transition hover:text-accent">
                Открыть историю
              </Link>
            </p>

            <div className={homeFeedGridClassName}>
              {visibleItems.map((item) => (
                <ReleaseCard
                  key={item.id}
                  release={item}
                  hoverPanelPortal
                  historyHint={formatWatchedLabel(item.watchedSeasonNumber, item.watchedEpisodeNumber)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
