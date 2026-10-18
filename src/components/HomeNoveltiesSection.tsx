"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { WATCH_HISTORY_UPDATED_EVENT } from "@/components/anime/AnimePosterWatchActions";
import { ReleaseCard } from "@/components/ReleaseCard";
import { headerControl } from "@/components/header/header-styles";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { homeFeedGridClassName, homeHistoryInnerPadX, homeHistoryOuterGutterX } from "@/lib/home-feed-layout";
import { isHomeTranslationVisible } from "@/lib/site-settings";
import type { ReleaseItemDto } from "@/lib/releases";
import type { WatchHistoryItemDto, WatchProgressDto } from "@/lib/watch-history";

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
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [collapsed, setCollapsed] = useState(true);
  /** Только на текущую сессию страницы — не пишем в localStorage/settings. */
  const [hideInHistory, setHideInHistory] = useState(false);
  const [historyIds, setHistoryIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!user) {
      setHistoryIds(new Set());
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/user/watch-history", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setHistoryIds(new Set());
          return;
        }
        const data = (await res.json()) as { items?: WatchHistoryItemDto[] };
        if (cancelled) return;
        setHistoryIds(new Set((data.items ?? []).map((item) => item.shikimoriId)));
      } catch {
        if (!cancelled) setHistoryIds(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const onHistoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ shikimoriId: number; progress: WatchProgressDto | null }>)
        .detail;
      if (detail?.shikimoriId == null) return;

      setHistoryIds((current) => {
        const next = new Set(current);
        if (detail.progress != null) next.add(detail.shikimoriId);
        else next.delete(detail.shikimoriId);
        return next;
      });
    };

    window.addEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
  }, [user]);

  const filteredByTranslation = useMemo(
    () =>
      items.filter((item) =>
        isHomeTranslationVisible(item.translationName, settings.homeTranslationFilter),
      ),
    [items, settings.homeTranslationFilter],
  );

  const visibleItems = useMemo(() => {
    if (!hideInHistory || !user) return filteredByTranslation;
    return filteredByTranslation.filter((item) => {
      if (item.shikimoriId == null) return true;
      return !historyIds.has(item.shikimoriId);
    });
  }, [filteredByTranslation, hideInHistory, historyIds, user]);

  if (filteredByTranslation.length === 0) return null;

  const bodyId = "home-novelties-panel-body";
  const showHideInHistoryToggle = Boolean(user) && !collapsed;

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

          {showHideInHistoryToggle ? (
            <button
              type="button"
              aria-pressed={hideInHistory}
              title="Временно скрыть тайтлы, которые уже есть в вашей истории просмотра"
              onClick={() => setHideInHistory((current) => !current)}
              className={[
                "shrink-0 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition sm:px-2.5 sm:text-xs",
                hideInHistory
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-card/60 text-muted hover:border-accent/40 hover:text-foreground",
              ].join(" ")}
            >
              <span className="sm:hidden">Без истории</span>
              <span className="hidden sm:inline">Скрыть уже в истории</span>
            </button>
          ) : null}
        </div>

        {!collapsed ? (
          <div
            id={bodyId}
            className={`site-header-text relative bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
          >
            {visibleItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card/50 px-3 py-4 text-center text-sm text-muted">
                Все новинки уже есть в вашей истории.
              </p>
            ) : (
              <div className={homeFeedGridClassName}>
                {visibleItems.map((item) => (
                  <ReleaseCard key={item.id} release={item} hoverPanelPortal />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
