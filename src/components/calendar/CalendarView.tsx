"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
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

function daySectionKey(dayOfWeek: number): string {
  return `day-${dayOfWeek}`;
}

function monthSectionKey(year: number, month: number): string {
  return `month-${year}-${month}`;
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

type CollapseControls = {
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
};

function CalendarFeedSection({
  id,
  sectionKey,
  title,
  countLabel,
  badge,
  collapse,
  children,
}: {
  id?: string;
  sectionKey: string;
  title: string;
  countLabel: string;
  badge?: ReactNode;
  collapse: CollapseControls;
  children: ReactNode;
}) {
  const collapsed = collapse.isCollapsed(sectionKey);
  const bodyId = `${sectionKey}-body`;

  return (
    <div className={`${homeHistoryOuterGutterX} mb-6 sm:mb-8`}>
      <section
        id={id}
        className={`home-history-section relative rounded-xl border border-border ${id ? DAY_SECTION_CLASS : ""}`}
      >
        <SectionBackdrop className={collapsed ? "hidden" : ""} />
        <div
          className={`site-header-text relative flex h-14 items-center justify-between gap-2 sm:h-16 ${homeHistoryInnerPadX} ${
            collapsed ? "bg-card" : "border-b border-border"
          }`}
        >
          <button
            type="button"
            className={`${headerControl.text} min-w-0 flex-1 justify-start gap-2 px-0`}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => collapse.toggle(sectionKey)}
          >
            <CollapseChevron collapsed={collapsed} />
            <span className="truncate text-sm font-semibold capitalize tracking-tight text-foreground sm:text-base">
              {title}
            </span>
            {badge}
            <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">({countLabel})</span>
          </button>
        </div>
        {!collapsed ? (
          <div
            id={bodyId}
            className={`site-header-text relative bg-card/95 py-3 backdrop-blur-lg backdrop-saturate-150 sm:py-4 ${homeHistoryInnerPadX}`}
          >
            {children}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TodayBadge() {
  return <span className="home-history-stop-badge ml-1">Сегодня</span>;
}

function CalendarDaySection({
  day,
  isToday,
  collapse,
}: {
  day: CalendarDay;
  isToday: boolean;
  collapse: CollapseControls;
}) {
  const sectionId = `calendar-day-${day.dayOfWeek}`;

  if (day.items.length === 0 && !isToday) return null;

  return (
    <CalendarFeedSection
      id={sectionId}
      sectionKey={daySectionKey(day.dayOfWeek)}
      title={day.label}
      countLabel={day.items.length === 0 ? "нет выходов" : formatCountLabel(day.items.length)}
      badge={isToday ? <TodayBadge /> : undefined}
      collapse={collapse}
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

function CalendarMonthSection({
  month,
  nested = false,
  collapse,
}: {
  month: CalendarMonth;
  nested?: boolean;
  collapse?: CollapseControls;
}) {
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

  if (nested || !collapse) {
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
      sectionKey={monthSectionKey(month.year, month.month)}
      title={month.label}
      countLabel={formatCountLabel(month.items.length)}
      collapse={collapse}
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
  collapse,
}: {
  days: CalendarDay[];
  todayDayOfWeek: number;
  collapse: CollapseControls;
}) {
  return (
    <>
      {days.map((day) => (
        <CalendarDaySection
          key={day.dayOfWeek}
          day={day}
          isToday={day.dayOfWeek === todayDayOfWeek}
          collapse={collapse}
        />
      ))}
    </>
  );
}

function CalendarMonthsList({
  months,
  nested = false,
  collapse,
}: {
  months: CalendarMonth[];
  nested?: boolean;
  collapse?: CollapseControls;
}) {
  const visibleMonths = months.filter((month) => month.items.length > 0);

  return (
    <>
      {visibleMonths.map((month) => (
        <CalendarMonthSection
          key={`${month.year}-${month.month}`}
          month={month}
          nested={nested}
          collapse={collapse}
        />
      ))}
    </>
  );
}

function CalendarAnonsMonthsList({
  months,
  collapse,
}: {
  months: CalendarMonth[];
  collapse: CollapseControls;
}) {
  const split = useMemo(() => splitAnonsMonthsBySchedule(months), [months]);

  return (
    <>
      {split.pastCount > 0 ? (
        <CalendarFeedSection
          sectionKey="anons-past"
          title="Прошедшие даты анонса"
          countLabel={formatCountLabel(split.pastCount)}
          collapse={collapse}
        >
          <CalendarMonthsList months={split.pastMonths} nested />
        </CalendarFeedSection>
      ) : null}

      {split.unknownCount > 0 ? (
        <CalendarFeedSection
          sectionKey="anons-unknown"
          title="Дата уточняется"
          countLabel={formatCountLabel(split.unknownCount)}
          collapse={collapse}
        >
          <CalendarItemsGrid items={split.unknownItems} />
        </CalendarFeedSection>
      ) : null}

      {split.upcomingCount > 0 ? (
        <CalendarMonthsList months={split.upcomingMonths} collapse={collapse} />
      ) : split.pastCount === 0 && split.unknownCount === 0 ? (
        <CalendarFeedSection
          sectionKey="anons-empty"
          title="Анонсы"
          countLabel="нет с датой"
          collapse={collapse}
        >
          <p className="text-sm text-muted">Нет анонсов с известной датой выхода.</p>
        </CalendarFeedSection>
      ) : (
        <CalendarFeedSection
          sectionKey="anons-upcoming-empty"
          title="Предстоящие"
          countLabel="нет с датой"
          collapse={collapse}
        >
          <p className="text-sm text-muted">Нет предстоящих анонсов с датой.</p>
        </CalendarFeedSection>
      )}
    </>
  );
}

function collectOngoingSectionKeys(days: CalendarDay[], todayDayOfWeek: number): string[] {
  return days
    .filter((day) => day.items.length > 0 || day.dayOfWeek === todayDayOfWeek)
    .map((day) => daySectionKey(day.dayOfWeek));
}

function collectAnonsSectionKeys(months: CalendarMonth[]): string[] {
  const split = splitAnonsMonthsBySchedule(months);
  const keys: string[] = [];
  if (split.pastCount > 0) keys.push("anons-past");
  if (split.unknownCount > 0) keys.push("anons-unknown");
  for (const month of split.upcomingMonths) {
    if (month.items.length > 0) keys.push(monthSectionKey(month.year, month.month));
  }
  if (split.upcomingCount === 0) {
    if (split.pastCount === 0 && split.unknownCount === 0) keys.push("anons-empty");
    else keys.push("anons-upcoming-empty");
  }
  return keys;
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
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(["anons-past", "anons-unknown"]),
  );
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

  const activeSectionKeys = useMemo(
    () =>
      tab === "ongoing"
        ? collectOngoingSectionKeys(ongoingDays, todayDayOfWeek)
        : collectAnonsSectionKeys(anonsMonths),
    [anonsMonths, ongoingDays, tab, todayDayOfWeek],
  );

  const allCollapsed =
    activeSectionKeys.length > 0 && activeSectionKeys.every((key) => collapsedKeys.has(key));

  const collapse = useMemo<CollapseControls>(
    () => ({
      isCollapsed: (key) => collapsedKeys.has(key),
      toggle: (key) => {
        setCollapsedKeys((current) => {
          const next = new Set(current);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      },
    }),
    [collapsedKeys],
  );

  const toggleAllCategories = useCallback(() => {
    setCollapsedKeys((current) => {
      const everyCollapsed =
        activeSectionKeys.length > 0 && activeSectionKeys.every((key) => current.has(key));
      if (everyCollapsed) return new Set();
      return new Set(activeSectionKeys);
    });
  }, [activeSectionKeys]);

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

            <div className="flex flex-wrap items-center gap-1">
              {tab === "ongoing"
                ? ONGOING_SOURCE_META.map((item) => {
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
                  })
                : null}

              {activeCount > 0 && activeSectionKeys.length > 0 ? (
                <button
                  type="button"
                  className={headerControl.textMuted}
                  onClick={toggleAllCategories}
                  aria-pressed={allCollapsed}
                >
                  {allCollapsed ? "Развернуть все" : "Свернуть все"}
                </button>
              ) : null}
            </div>
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
            <CalendarDaysList
              days={ongoingDays}
              todayDayOfWeek={todayDayOfWeek}
              collapse={collapse}
            />
          ) : (
            <CalendarAnonsMonthsList months={anonsMonths} collapse={collapse} />
          )}
        </div>
      )}
    </div>
  );
}
