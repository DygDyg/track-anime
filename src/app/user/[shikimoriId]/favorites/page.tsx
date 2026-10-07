import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FavoritesView } from "@/components/favorites/FavoritesView";
import { ShikimoriReconnectRequired } from "@/components/auth/ShikimoriReconnectRequired";
import {
  getAllFavoritesData,
  parseFavoritesSort,
  parseFavoritesTab,
} from "@/lib/favorites-page";
import { getSession } from "@/lib/auth/session";
import { parseShikimoriIdParam, userFavoritesPath, userProfilePath } from "@/lib/public-user";
import { buildUserProfilePageMetadata } from "@/lib/site-metadata";
import { ShikimoriAuthError } from "@/lib/shikimori/auth-client";
import {
  getResolvedUserFavorites,
  resolveUserProfile,
} from "@/lib/user-profile-resolver";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shikimoriId: string }>;
  searchParams: Promise<{ tab?: string; sort?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriIdParam(raw);
  if (!shikimoriId) {
    return { title: "Пользователь не найден" };
  }

  const resolved = await resolveUserProfile(shikimoriId);
  if (!resolved) {
    return { title: "Пользователь не найден" };
  }

  return buildUserProfilePageMetadata({
    nickname: resolved.profile.nickname,
    avatar: resolved.profile.avatar,
    canonicalPath: userFavoritesPath(resolved.profile.shikimoriId),
    pageKind: "favorites",
  });
}

export default async function PublicUserFavoritesPage({ params, searchParams }: Props) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriIdParam(raw);
  if (!shikimoriId) notFound();

  const resolved = await resolveUserProfile(shikimoriId);
  if (!resolved) notFound();

  const session = await getSession();
  const { profile } = resolved;
  const viewingSelf = session?.user.shikimoriId === profile.shikimoriId;
  const { tab: tabParam, sort: sortParam } = await searchParams;
  const initialTab = parseFavoritesTab(tabParam);
  const initialSort = parseFavoritesSort(sortParam);
  const basePath = `/user/${profile.shikimoriId}/favorites`;
  const backHref = userProfilePath(profile.shikimoriId);
  const pageTitle = `Списки ${profile.nickname}`;

  if (viewingSelf && session) {
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
            nickname={profile.nickname}
            sync={data.sync}
            shouldBackgroundSync={data.shouldBackgroundSync}
            basePath={basePath}
            backHref={backHref}
            pageTitle={pageTitle}
            showViewerListStatus={false}
          />
        </Suspense>
      );
    } catch (err) {
      if (err instanceof ShikimoriAuthError) {
        return <ShikimoriReconnectRequired />;
      }
      throw err;
    }
  }

  const favoritesResult = await getResolvedUserFavorites(profile);
  const data = favoritesResult.data;

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Назад к профилю
        </Link>
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-lg shadow-black/20">
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="mt-3 text-sm text-muted">
            {profile.onTrackAnime
              ? "У этого пользователя пока нет сохранённых списков на Track Anime."
              : "Не удалось загрузить списки с Shikimori — возможно, они скрыты или пусты."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <FavoritesView
        tabs={data.tabs}
        counts={data.counts}
        mangaBookmarkCount={data.mangaBookmarkCount}
        initialTab={initialTab}
        initialSort={initialSort}
        nickname={profile.nickname}
        sync={data.sync}
        shouldBackgroundSync={false}
        basePath={basePath}
        readOnly
        dataSource={favoritesResult.source}
        backHref={backHref}
        pageTitle={pageTitle}
        showViewerListStatus
      />
    </Suspense>
  );
}
