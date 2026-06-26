import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoritesView } from "@/components/favorites/FavoritesView";
import { parseFavoritesTab } from "@/lib/favorites-page";
import { getSession } from "@/lib/auth/session";
import { parseShikimoriIdParam, userProfilePath } from "@/lib/public-user";
import {
  getResolvedUserFavorites,
  resolveUserProfile,
} from "@/lib/user-profile-resolver";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shikimoriId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriIdParam(raw);
  if (!shikimoriId) {
    return { title: "Пользователь не найден — Track Anime" };
  }

  const resolved = await resolveUserProfile(shikimoriId);
  if (!resolved) {
    return { title: "Пользователь не найден — Track Anime" };
  }

  return {
    title: `Списки ${resolved.profile.nickname} — Track Anime`,
    description: `Аниме-списки и закладки пользователя ${resolved.profile.nickname}`,
  };
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
  const { tab: tabParam } = await searchParams;
  const initialTab = parseFavoritesTab(tabParam);
  const favoritesResult = await getResolvedUserFavorites(profile);
  const data = favoritesResult.data;
  const basePath = `/user/${profile.shikimoriId}/favorites`;

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          href={userProfilePath(profile.shikimoriId)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Назад к профилю
        </Link>
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-lg shadow-black/20">
          <h1 className="text-2xl font-bold text-foreground">Списки {profile.nickname}</h1>
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
    <FavoritesView
      tabs={data.tabs}
      counts={data.counts}
      mangaBookmarkCount={data.mangaBookmarkCount}
      initialTab={initialTab}
      nickname={profile.nickname}
      sync={data.sync}
      shouldBackgroundSync={false}
      basePath={basePath}
      readOnly
      dataSource={favoritesResult.source}
      backHref={userProfilePath(profile.shikimoriId)}
      pageTitle={`Списки ${profile.nickname}`}
      showViewerListStatus={!viewingSelf}
    />
  );
}
