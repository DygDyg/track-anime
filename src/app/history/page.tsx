import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HistoryView } from "@/components/history/HistoryView";
import { getSession } from "@/lib/auth/session";
import { getHistoryUpcomingSoon } from "@/lib/history-upcoming-soon";
import { buildSitePageMetadata } from "@/lib/site-metadata";
import { getWatchHistory } from "@/lib/watch-history";

export const metadata: Metadata = buildSitePageMetadata({
  title: "История",
  description: "Продолжить просмотр с сохранённой позиции",
  canonicalPath: "/history",
});

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [items, upcomingSoon] = await Promise.all([
    getWatchHistory(session.user.id),
    getHistoryUpcomingSoon(session.user.id),
  ]);

  return <HistoryView initialItems={items} upcomingSoon={upcomingSoon} />;
}
