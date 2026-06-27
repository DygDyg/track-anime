import { ReleaseCard } from "@/components/ReleaseCard";
import { CalendarScrollToToday } from "@/components/calendar/CalendarScrollToToday";
import type { CalendarDay } from "@/lib/calendar";
import { calendarItemToReleaseDto } from "@/lib/calendar";

const RELEASE_GRID_CLASS =
  "flex flex-col gap-2 overflow-visible px-3 sm:px-6 md:grid md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:items-stretch md:gap-x-8 md:gap-y-4 md:px-12 md:overflow-visible lg:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] lg:gap-x-10 lg:px-16 xl:px-24";

const DAY_SECTION_CLASS = "scroll-mt-20 overflow-visible";

function CalendarDaySection({
  day,
  isToday,
}: {
  day: CalendarDay;
  isToday: boolean;
}) {
  const sectionId = `calendar-day-${day.dayOfWeek}`;

  if (day.items.length === 0 && !isToday) return null;

  if (day.items.length === 0) {
    return (
      <section id={sectionId} className={DAY_SECTION_CLASS}>
        <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 text-accent sm:px-6 md:px-12 lg:px-16 xl:px-24">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            {day.label}
            <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              Сегодня
            </span>
          </h2>
          <p className="text-sm text-muted">Нет выходов</p>
        </header>
      </section>
    );
  }

  return (
    <section id={sectionId} className={DAY_SECTION_CLASS}>
      <header
        className={[
          "mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 sm:px-6 md:px-12 lg:px-16 xl:px-24",
          isToday ? "text-accent" : "text-foreground",
        ].join(" ")}
      >
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          {day.label}
          {isToday ? (
            <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              Сегодня
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted">{day.items.length} тайтлов</p>
      </header>

      <div className={RELEASE_GRID_CLASS}>
        {day.items.map((item) => (
          <ReleaseCard key={item.shikimoriId} release={calendarItemToReleaseDto(item)} />
        ))}
      </div>
    </section>
  );
}

export function CalendarView({
  days,
  todayDayOfWeek,
  totalCount,
}: {
  days: CalendarDay[];
  todayDayOfWeek: number;
  totalCount: number;
}) {
  return (
    <>
      <CalendarScrollToToday todayDayOfWeek={todayDayOfWeek} />
      <header className="mb-6 px-3 sm:px-6 md:px-12 lg:px-16 xl:px-24">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Календарь</h1>
        <p className="mt-2 text-xs text-muted">Всего тайтлов: {totalCount}</p>
      </header>

      {totalCount === 0 ? (
        <div className="mx-3 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center sm:mx-6 sm:p-10 md:mx-12 lg:mx-16 xl:mx-24">
          <p className="text-muted">Пока нет онгоингов с данными о релизах.</p>
          <code className="mt-3 inline-block rounded bg-background px-3 py-1 text-sm text-accent">
            npm run kodik:sync
          </code>
        </div>
      ) : (
        <div className="space-y-8 overflow-visible sm:space-y-10">
          {days.map((day) => (
            <CalendarDaySection
              key={day.dayOfWeek}
              day={day}
              isToday={day.dayOfWeek === todayDayOfWeek}
            />
          ))}
        </div>
      )}
    </>
  );
}
