import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HistoryView } from "@/components/history/HistoryView";
import { getSession } from "@/lib/auth/session";
import { getWatchHistory } from "@/lib/watch-history";

export const metadata: Metadata = {
  title: "История — Track Anime",
  description: "Продолжить просмотр с сохранённой позиции",
};

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const items = await getWatchHistory(session.user.id);

  return <HistoryView initialItems={items} />;
}
