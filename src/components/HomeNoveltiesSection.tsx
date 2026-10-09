"use client";

import { useMemo, useState } from "react";
import { ReleaseCard } from "@/components/ReleaseCard";
import { headerControl } from "@/components/header/header-styles";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { homeFeedGridClassName, homeHistoryInnerPadX, homeHistoryOuterGutterX } from "@/lib/home-feed-layout";
import { isHomeTranslationVisible } from "@/lib/site-settings";
import type { ReleaseItemDto } from "@/lib/releases";

function NoveltiesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l1.8 5.5H19l-4.4 3.2 1.7 5.3L12 13.8 7.7 17l1.7-5.3L5 8.5h5.2L12 3z"
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

export function HomeNoveltiesSection({ items }: { items: ReleaseItemDto[] }) {
  const { settings } = useSiteSettings();
  const [collapsed, setCollapsed] = useState(true);

  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        isHomeTranslationVisible(item.translationName, settings.homeTranslationFilter),
      ),
    [items, settings.homeTranslationFilter],
  );

  if (visibleItems.length === 0) return null;

  const bodyId = "home-novelties-panel-body";

  return (
    <div className={`${homeHistoryOuterGutterX} mb-6 sm:mb-8`}>
      <section
        className="home-history-section relative rounded-xl border border-border"
        aria-labelledby="home-novelties-panel-title"
      >
        <div
          aria-hidden
          className={[
            "site-header-bg pointer-events-none absolute inset-0 overflow-hidden rounded-xl backdrop-blur-lg backdrop-saturate-150",
            collapsed ? "hidden" : "",
          ].join(" ")}
        />

        <div
          className={`site-header-text relative flex h-14 items-center justify-between gap-2 sm:h-16 sm:gap-2.5 ${homeHistoryInnerPadX} ${
            collapsed ? "bg-card" : "border-b border-border"
          }`}
        >
          <button
            type="button"
            className={`${headerControl.text} min-w-0 flex-1 justify-start gap-2 px-0 sm:gap-2.5`}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => setCollapsed((current) => !current)}
          >
            <CollapseChevron collapsed={collapsed} />
            <span className={`${headerControl.icon} pointer-events-none shrink-0 text-accent`}>
              <NoveltiesIcon />
            </span>
            <span
              id="home-novelties-panel-title"
              className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base"
            >
              Новинки
            </span>
            <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">
              ({formatCountLabel(visibleItems.length)})
            </span>
          </button>
        </div>

        {!collapsed ? (
          <div
            id={bodyId}
            className={`site-header-text relative bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
          >
            <div className={homeFeedGridClassName}>
              {visibleItems.map((item) => (
                <ReleaseCard key={item.id} release={item} hoverPanelPortal />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
