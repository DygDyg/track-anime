import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FavoritesView } from "@/components/favorites/FavoritesView";
import { getSession } from "@/lib/auth/session";
import { getAllFavoritesData, parseFavoritesSort, parseFavoritesTab } from "@/lib/favorites-page";
import { buildSitePageMetadata } from "@/lib/site-metadata";
import { ShikimoriAuthError } from "@/lib/shikimori/auth-client";

export const metadata: Metadata = buildSitePageMetadata({
  title: "Избранное",
  description: "Списки аниме и закладки из Shikimori",
  canonicalPath: "/favorites",
});

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string; sort?: string }>;
};

export default async function FavoritesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { tab: tabParam, sort: sortParam } = await searchParams;
  const initialTab = parseFavoritesTab(tabParam);
  const initialSort = parseFavoritesSort(sortParam);

  try {
    const data = await getAllFavoritesData(session.user.id, session.user.shikimoriId);
    return (
      <Suspense fallback={null}>
        <FavoritesView
          tabs={data.tabs}
          counts={data.counts}
          mangaBookmarkCount={data.mangaBookmarkCount}
          initialTab={initialTab}
          initialSort={initialSort}
          nickname={session.user.nickname}
          sync={data.sync}
          shouldBackgroundSync={data.shouldBackgroundSync}
        />
      </Suspense>
    );
  } catch (err) {
    if (err instanceof ShikimoriAuthError) {
      redirect("/login?error=oauth_failed");
    }
    throw err;
  }
}
