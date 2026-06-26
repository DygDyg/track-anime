import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AnimePageView } from "@/components/anime/AnimePageView";
import { getAnimePageData } from "@/lib/anime-page";
import { buildAnimePageMetadata } from "@/lib/site-metadata";

export const revalidate = 3600;

type Props = {
  params: Promise<{ shikimoriId: string }>;
};

function parseShikimoriId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) return { title: "Аниме не найдено" };

  const anime = await getAnimePageData(shikimoriId);
  if (!anime) return { title: "Аниме не найдено" };

  return buildAnimePageMetadata({
    title: anime.title,
    description: anime.description,
    posterUrl: anime.posterUrl,
    shikimoriId,
    score: anime.score,
    kind: anime.kind,
    episodes: anime.episodes,
    episodesAired: anime.episodesAired,
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
