import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FavoritesView } from "@/components/favorites/FavoritesView";
import { getSession } from "@/lib/auth/session";
import { getAllFavoritesData, parseFavoritesTab } from "@/lib/favorites-page";
import { buildSitePageMetadata } from "@/lib/site-metadata";
import { ShikimoriAuthError } from "@/lib/shikimori/auth-client";

export const metadata: Metadata = buildSitePageMetadata({
  title: "Избранное",
  description: "Списки аниме и закладки из Shikimori",
  canonicalPath: "/favorites",
});

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function FavoritesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { tab: tabParam } = await searchParams;
  const initialTab = parseFavoritesTab(tabParam);

  try {
    const data = await getAllFavoritesData(session.user.id, session.user.shikimoriId);
    return (
      <FavoritesView
        tabs={data.tabs}
        counts={data.counts}
        mangaBookmarkCount={data.mangaBookmarkCount}
        initialTab={initialTab}
        nickname={session.user.nickname}
        sync={data.sync}
        shouldBackgroundSync={data.shouldBackgroundSync}
      />
    );
  } catch (err) {
    if (err instanceof ShikimoriAuthError) {
      redirect("/login?error=oauth_failed");
    }
    throw err;
  }
}
