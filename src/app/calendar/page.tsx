import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/CalendarView";
import {
  getCalendarPageData,
  getMoscowDayOfWeek,
  parseCalendarOngoingSource,
  parseCalendarTab,
} from "@/lib/calendar";
import { buildSitePageMetadata } from "@/lib/site-metadata";

export const revalidate = 300;

export const metadata: Metadata = buildSitePageMetadata({
  title: "Календарь",
  description: "Расписание выхода онгоингов и анонсов по дням недели",
  canonicalPath: "/calendar",
});

type Props = {
  searchParams: Promise<{ tab?: string; source?: string }>;
};

export default async function CalendarPage({ searchParams }: Props) {
  const { tab: tabParam, source: sourceParam } = await searchParams;
  const initialTab = parseCalendarTab(tabParam);
  const initialOngoingSource = parseCalendarOngoingSource(sourceParam);
  const { ongoingDays, anonsMonths } = await getCalendarPageData(initialOngoingSource);
  const todayDayOfWeek = getMoscowDayOfWeek();

  return (
    <CalendarView
      ongoingDays={ongoingDays}
      anonsMonths={anonsMonths}
      todayDayOfWeek={todayDayOfWeek}
      initialTab={initialTab}
      initialOngoingSource={initialOngoingSource}
    />
  );
}
