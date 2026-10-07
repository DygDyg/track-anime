import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AnimePageView } from "@/components/anime/AnimePageView";
import { getAnimePageData } from "@/lib/anime-page";
import {
  buildAnimeWatchShareCanonicalPath,
  buildAnimeWatchShareMetaLine,
  hasAnimeWatchDeepLinkTarget,
  parseAnimeWatchDeepLinkFromSearchParams,
} from "@/lib/anime-watch-share";
import { buildAnimePageMetadata } from "@/lib/site-metadata";

export const revalidate = 3600;

type Props = {
  params: Promise<{ shikimoriId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseShikimoriId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) return { title: "Аниме не найдено" };

  const anime = await getAnimePageData(shikimoriId);
  if (!anime) return { title: "Аниме не найдено" };

  const deepLink = parseAnimeWatchDeepLinkFromSearchParams(await searchParams);
  const translationTitle =
    deepLink.translationId != null
      ? (anime.translations.find((tr) => tr.translationId === deepLink.translationId)
          ?.translationTitle ?? null)
      : null;

  const watchShareMetaLine = hasAnimeWatchDeepLinkTarget(deepLink)
    ? buildAnimeWatchShareMetaLine({
        player: deepLink.player,
        season: deepLink.season,
        episode: deepLink.episode,
        translationTitle,
        positionSeconds: deepLink.positionSeconds,
      })
    : deepLink.player
      ? buildAnimeWatchShareMetaLine({ player: deepLink.player })
      : null;

  const watchShareCanonicalPath =
    watchShareMetaLine != null
      ? buildAnimeWatchShareCanonicalPath(shikimoriId, deepLink)
      : null;

  return buildAnimePageMetadata({
    title: anime.title,
    description: anime.description,
    posterUrl: anime.posterUrl,
    shikimoriId,
    score: anime.score,
    kind: anime.kind,
    episodes: anime.episodes,
    episodesAired: anime.episodesAired,
    watchShareMetaLine,
    watchShareCanonicalPath,
  });
}

export default async function AnimePage({ params }: Props) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) notFound();

  const anime = await getAnimePageData(shikimoriId);
  if (!anime) notFound();

  return <AnimePageView anime={anime} />;
}
