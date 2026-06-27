import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/CalendarView";
import { getMoscowDayOfWeek, getOngoingCalendar } from "@/lib/calendar";
import { buildSitePageMetadata } from "@/lib/site-metadata";

export const revalidate = 300;

export const metadata: Metadata = buildSitePageMetadata({
  title: "Календарь",
  description: "Расписание выхода онгоингов по дням недели",
  canonicalPath: "/calendar",
});

export default async function CalendarPage() {
  const days = await getOngoingCalendar();
  const totalCount = days.reduce((sum, day) => sum + day.items.length, 0);
  const todayDayOfWeek = getMoscowDayOfWeek();

  return (
    <div className="py-5 sm:py-8">
      <CalendarView days={days} todayDayOfWeek={todayDayOfWeek} totalCount={totalCount} />
    </div>
  );
}
