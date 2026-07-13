"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { ReleaseCard } from "@/components/ReleaseCard";
import { CalendarScrollToToday } from "@/components/calendar/CalendarScrollToToday";
import { headerControl } from "@/components/header/header-styles";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoading";
import type {
  CalendarDay,
  CalendarItemDto,
  CalendarMonth,
  CalendarOngoingSource,
  CalendarTab,
} from "@/lib/calendar";
import { calendarItemToReleaseDto, splitAnonsMonthsBySchedule } from "@/lib/calendar";
import {
  homeFeedGridClassName,
  homeHistoryInnerPadX,
  homeHistoryOuterGutterX,
} from "@/lib/home-feed-layout";

const RELEASE_GRID_CLASS = `${homeFeedGridClassName} md:overflow-visible`;
const DAY_SECTION_CLASS = "scroll-mt-20";

const TAB_META: { id: CalendarTab; label: string; emptyText: string; syncHint: string }[] = [
  {
    id: "ongoing",
    label: "Онгоинги",
    emptyText: "Пока нет онгоингов с расписанием следующей серии.",
    syncHint: "npm run kodik:sync",
  },
  {
    id: "anons",
    label: "Анонсы",
    emptyText: "Пока нет анонсов в каталоге Shikimori.",
    syncHint: "npm run shikimori:sync-anons",
  },
];

const ONGOING_SOURCE_META: { id: CalendarOngoingSource; label: string }[] = [
  { id: "kodik", label: "TA" },
  { id: "shikimori", label: "Календарь шики" },
];

function calendarHref(tab: CalendarTab, source: CalendarOngoingSource): string {
  const params = new URLSearchParams();
  if (tab === "anons") params.set("tab", "anons");
  if (tab === "ongoing" && source === "shikimori") params.set("source", "shikimori");
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

function formatCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} тайтл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} тайтла`;
  return `${count} тайтлов`;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function SpoilerChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 -rotate-90 text-muted transition-transform duration-200 group-open:rotate-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SectionBackdrop({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={[
        "site-header-bg pointer-events-none absolute inset-0 overflow-hidden rounded-xl backdrop-blur-lg backdrop-saturate-150",
        className,
      ].join(" ")}
    />
  );
}

function CalendarFeedSection({
  id,
  title,
  countLabel,
  badge,
  children,
}: {
  id?: string;
  title: string;
  countLabel: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${homeHistoryOuterGutterX} mb-6 sm:mb-8`}>
      <section
        id={id}
        className={`home-history-section relative rounded-xl border border-border ${id ? DAY_SECTION_CLASS : ""}`}
      >
        <SectionBackdrop />
        <div
          className={`site-header-text relative flex h-14 items-center gap-2 border-b border-border sm:h-16 ${homeHistoryInnerPadX}`}
        >
          <h2 className="truncate text-sm font-semibold capitalize tracking-tight text-foreground sm:text-base">
            {title}
          </h2>
          {badge}
          <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">({countLabel})</span>
        </div>
        <div
          className={`site-header-text relative bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

function CalendarSpoiler({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className={`${homeHistoryOuterGutterX} mb-6 sm:mb-8`}>
      <details className="home-history-section group relative rounded-xl border border-border">
        <SectionBackdrop className="hidden group-open:block" />
        <summary
          className={`site-header-text relative flex h-14 cursor-pointer list-none items-center gap-2 bg-card marker:content-none sm:h-16 ${homeHistoryInnerPadX} group-open:border-b group-open:border-border group-open:bg-transparent [&::-webkit-details-marker]:hidden`}
        >
          <SpoilerChevron />
          <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">{title}</span>
          <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">({formatCountLabel(count)})</span>
        </summary>
        <div
          className={`site-header-text relative bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
        >
          {children}
        </div>
      </details>
    </div>
  );
}

function TodayBadge() {
  return <span className="home-history-stop-badge ml-1">Сегодня</span>;
}

function CalendarDaySection({
  day,
  isToday,
}: {
  day: CalendarDay;
  isToday: boolean;
}) {
  const sectionId = `calendar-day-${day.dayOfWeek}`;

  if (day.items.length === 0 && !isToday) return null;

  return (
    <CalendarFeedSection
      id={sectionId}
      title={day.label}
      countLabel={day.items.length === 0 ? "нет выходов" : formatCountLabel(day.items.length)}
      badge={isToday ? <TodayBadge /> : undefined}
    >
      {day.items.length > 0 ? (
        <div className={RELEASE_GRID_CLASS}>
          {day.items.map((item) => (
            <ReleaseCard
              key={item.shikimoriId}
              release={calendarItemToReleaseDto(item)}
              hoverPanelPortal
            />
          ))}
        </div>
      ) : null}
    </CalendarFeedSection>
  );
}

function CalendarMonthSection({ month, nested = false }: { month: CalendarMonth; nested?: boolean }) {
  const sectionId = `calendar-month-${month.year}-${month.month}`;

  if (month.items.length === 0) return null;

  const grid = (
    <div className={RELEASE_GRID_CLASS}>
      {month.items.map((item) => (
        <ReleaseCard
          key={item.shikimoriId}
          release={calendarItemToReleaseDto(item)}
          hoverPanelPortal
        />
      ))}
    </div>
  );

  if (nested) {
    return (
      <section id={sectionId} className="border-b border-border/80 pb-5 last:border-0 last:pb-0">
        <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold capitalize text-foreground sm:text-base">{month.label}</h3>
          <p className="text-xs text-muted sm:text-sm">{formatCountLabel(month.items.length)}</p>
        </header>
        {grid}
      </section>
    );
  }

  return (
    <CalendarFeedSection
      id={sectionId}
      title={month.label}
      countLabel={formatCountLabel(month.items.length)}
    >
      {grid}
    </CalendarFeedSection>
  );
}

function CalendarItemsGrid({ items }: { items: CalendarItemDto[] }) {
  return (
    <div className={RELEASE_GRID_CLASS}>
      {items.map((item) => (
        <ReleaseCard
          key={item.shikimoriId}
          release={calendarItemToReleaseDto(item)}
          hoverPanelPortal
        />
      ))}
    </div>
  );
}

function CalendarDaysList({
  days,
  todayDayOfWeek,
}: {
  days: CalendarDay[];
  todayDayOfWeek: number;
}) {
  return (
    <>
      {days.map((day) => (
        <CalendarDaySection
          key={day.dayOfWeek}
          day={day}
          isToday={day.dayOfWeek === todayDayOfWeek}
        />
      ))}
    </>
  );
}

function CalendarMonthsList({
  months,
  nested = false,
}: {
  months: CalendarMonth[];
  nested?: boolean;
}) {
  const visibleMonths = months.filter((month) => month.items.length > 0);

  return (
    <>
      {visibleMonths.map((month) => (
        <CalendarMonthSection
          key={`${month.year}-${month.month}`}
          month={month}
          nested={nested}
        />
      ))}
    </>
  );
}

function CalendarAnonsMonthsList({ months }: { months: CalendarMonth[] }) {
  const split = useMemo(() => splitAnonsMonthsBySchedule(months), [months]);

  return (
    <>
      {split.pastCount > 0 ? (
        <CalendarSpoiler title="Прошедшие даты анонса" count={split.pastCount}>
          <CalendarMonthsList months={split.pastMonths} nested />
        </CalendarSpoiler>
      ) : null}

      {split.unknownCount > 0 ? (
        <CalendarSpoiler title="Дата уточняется" count={split.unknownCount}>
          <CalendarItemsGrid items={split.unknownItems} />
        </CalendarSpoiler>
      ) : null}

      {split.upcomingCount > 0 ? (
        <CalendarMonthsList months={split.upcomingMonths} />
      ) : split.pastCount === 0 && split.unknownCount === 0 ? (
        <CalendarFeedSection title="Анонсы" countLabel="нет с датой">
          <p className="text-sm text-muted">Нет анонсов с известной датой выхода.</p>
        </CalendarFeedSection>
      ) : (
        <CalendarFeedSection title="Предстоящие" countLabel="нет с датой">
          <p className="text-sm text-muted">Нет предстоящих анонсов с датой.</p>
        </CalendarFeedSection>
      )}
    </>
  );
}

export function CalendarView({
  ongoingDays,
  anonsMonths,
  todayDayOfWeek,
  initialTab,
  initialOngoingSource,
}: {
  ongoingDays: CalendarDay[];
  anonsMonths: CalendarMonth[];
  todayDayOfWeek: number;
  initialTab: CalendarTab;
  initialOngoingSource: CalendarOngoingSource;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<CalendarTab>(initialTab);
  const [ongoingSource, setOngoingSource] = useState<CalendarOngoingSource>(initialOngoingSource);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setTab(initialTab);
    setOngoingSource(initialOngoingSource);
  }, [initialOngoingSource, initialTab]);

  const counts = useMemo(
    () => ({
      ongoing: ongoingDays.reduce((sum, day) => sum + day.items.length, 0),
      anons: anonsMonths.reduce((sum, month) => sum + month.items.length, 0),
    }),
    [anonsMonths, ongoingDays],
  );

  const activeCount = tab === "ongoing" ? counts.ongoing : counts.anons;
  const activeMeta = TAB_META.find((item) => item.id === tab) ?? TAB_META[0];

  const handleTabChange = useCallback(
    (next: CalendarTab) => {
      if (next === tab) return;
      setTab(next);
      startTransition(() => {
        router.replace(calendarHref(next, ongoingSource), { scroll: false });
      });
    },
    [ongoingSource, router, tab],
  );

  const handleOngoingSourceChange = useCallback(
    (next: CalendarOngoingSource) => {
      if (next === ongoingSource && tab === "ongoing") return;
      setTab("ongoing");
      setOngoingSource(next);
      startTransition(() => {
        router.replace(calendarHref("ongoing", next), { scroll: false });
      });
    },
    [ongoingSource, router, tab],
  );

  return (
    <div className="py-5 sm:py-8">
      {tab === "ongoing" ? <CalendarScrollToToday todayDayOfWeek={todayDayOfWeek} /> : null}

      <div className={`${homeHistoryOuterGutterX} mb-6 sm:mb-8`}>
        <section className="home-history-section relative rounded-xl border border-border">
          <SectionBackdrop />
          <div
            className={`site-header-text relative flex min-h-14 flex-wrap items-center justify-between gap-2 py-2 sm:min-h-16 ${homeHistoryInnerPadX}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className={`${headerControl.icon} pointer-events-none shrink-0 text-accent`}>
                <CalendarIcon />
              </span>
              <h1 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
                Календарь
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Разделы календаря">
              {TAB_META.map((item) => {
                const active = tab === item.id;
                const count = counts[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTabChange(item.id)}
                    className={headerControl.nav(active)}
                  >
                    {item.label}
                    {count > 0 ? <span className="ml-1 tabular-nums opacity-80">{count}</span> : null}
                  </button>
                );
              })}
            </div>

            {tab === "ongoing" ? (
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Источник календаря онгоингов">
                {ONGOING_SOURCE_META.map((item) => {
                  const active = ongoingSource === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOngoingSourceChange(item.id)}
                      className={headerControl.nav(active)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {activeCount === 0 ? (
        <div className={`${homeHistoryOuterGutterX}`}>
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center sm:p-10">
            <p className="text-sm text-muted">{activeMeta.emptyText}</p>
            <code className="mt-3 inline-block rounded bg-background px-3 py-1 text-sm text-accent">
              {activeMeta.syncHint}
            </code>
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-busy={isPending}
          className={["relative", isPending ? "favorites-tab-panel-pending" : ""].join(" ")}
        >
          {isPending ? <BrandLoadingOverlay /> : null}
          {tab === "ongoing" ? (
            <CalendarDaysList days={ongoingDays} todayDayOfWeek={todayDayOfWeek} />
          ) : (
            <CalendarAnonsMonthsList months={anonsMonths} />
          )}
        </div>
      )}
    </div>
  );
}
