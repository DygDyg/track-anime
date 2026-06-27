import { isShikimoriStubMaterial } from "@/db/save-shikimori-material";
import { cache } from "react";
import { resolveEpisodesTotalForShikimoriMaterials } from "@/lib/episode-totals";
import { prisma } from "@/lib/prisma";
import { extractKodikMaterialMeta } from "@/lib/kodik-material-meta";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { parseScreenshotUrls } from "@/lib/screenshots";
import { discoverPosterUrl, posterFromShikimoriAnime } from "@/lib/poster-fallback";
import {
  getShikimoriAnime,
  getShikimoriAnimeCachedOnly,
  scheduleShikimoriAnimeRefresh,
} from "@/lib/shikimori/animes";
import { isShikimoriMissingImage, shikimoriAssetUrl } from "@/lib/shikimori/client";
import { getShikimoriEndpoints, shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import type { ShikimoriAnime } from "@/lib/shikimori/types";

export type KodikTranslationDto = {
  kodikId: string;
  translationId: number;
  translationTitle: string;
  translationType: string;
  lastSeason: number | null;
  lastEpisode: number | null;
  playerLink: string | null;
  quality: string | null;
};

export type AnimePageDto = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  posterUrl: string | null;
  score: string | null;
  status: string | null;
  kind: string | null;
  rating: string | null;
  episodes: number | null;
  episodesAired: number | null;
  duration: number | null;
  airedOn: string | null;
  releasedOn: string | null;
  description: string | null;
  genres: { id: number; name: string }[];
  studios: { id: number; name: string }[];
  synonyms: string[];
  shikimoriUrl: string | null;
  screenshots: string[];
  translations: KodikTranslationDto[];
  hasShikimori: boolean;
  scoreCount: number | null;
  dubbers: string[];
};

function posterFromMaterialData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  return resolveMaterialPosterUrl(data as MaterialPosterSource);
}

function normalizePlayerLink(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("//")) return `https:${link}`;
  return link;
}

function normalizeDescription(text: string | null): string | null {
  if (!text) return null;
  return text.trim();
}

function sumScoreVotes(stats: ShikimoriAnime["rates_scores_stats"]): number | null {
  if (!stats?.length) return null;
  const total = stats.reduce((sum, row) => sum + row.value, 0);
  return total > 0 ? total : null;
}

function collectDubbers(anime: ShikimoriAnime | null, translations: KodikTranslationDto[]): string[] {
  const fromKodik = translations
    .filter((tr) => tr.translationType === "voice")
    .map((tr) => tr.translationTitle.trim())
    .filter(Boolean);
  const fromShikimori = anime?.fandubbers?.map((name) => name.trim()).filter(Boolean) ?? [];

  const seen = new Map<string, string>();
  for (const name of [...fromKodik, ...fromShikimori]) {
    const key = name.toLocaleLowerCase("ru-RU");
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

function mapGenres(
  anime: ShikimoriAnime | null,
  kodikGenres: string[],
): AnimePageDto["genres"] {
  if (anime?.genres?.length) {
    return anime.genres.map((g) => ({
      id: g.id,
      name: g.russian || g.name,
    }));
  }

  return kodikGenres.map((name, index) => ({
    id: -(index + 1),
    name,
  }));
}

function mapStudios(
  anime: ShikimoriAnime | null,
  kodikStudios: string[],
): AnimePageDto["studios"] {
  if (anime?.studios?.length) {
    return anime.studios.map((s) => ({
      id: s.id,
      name: s.name,
    }));
  }

  return kodikStudios.map((name, index) => ({
    id: -(index + 1),
    name,
  }));
}

function screenshotsFromMaterialData(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  return parseScreenshotUrls((data as { screenshots?: unknown }).screenshots);
}

function mapAnimeToDto(
  shikimoriId: number,
  anime: ShikimoriAnime | null,
  translations: KodikTranslationDto[],
  fallbackPoster: string | null,
  fallbackTitle: string | null,
  kodikScreenshots: string[],
  kodikMeta: ReturnType<typeof extractKodikMaterialMeta>,
  metaMaterials: Array<{
    lastEpisode: number | null;
    episodesCount: number | null;
    materialData: unknown;
  }>,
): AnimePageDto {
  const title = anime?.russian || anime?.name || fallbackTitle || "Без названия";
  const posterUrl =
    posterFromShikimoriAnime(anime) ??
    (fallbackPoster && !isShikimoriMissingImage(fallbackPoster) ? fallbackPoster : null);

  const episodes =
    resolveEpisodesTotalForShikimoriMaterials(shikimoriId, anime, metaMaterials) ??
    anime?.episodes ??
    null;

  return {
    shikimoriId,
    title,
    titleOriginal: anime?.name ?? null,
    posterUrl,
    score: anime?.score ?? null,
    status: anime?.status ?? null,
    kind: anime?.kind ?? null,
    rating: anime?.rating ?? null,
    episodes,
    episodesAired: anime?.episodes_aired ?? null,
    duration: anime?.duration ?? null,
    airedOn: anime?.aired_on ?? null,
    releasedOn: anime?.released_on ?? null,
    description: normalizeDescription(anime?.description ?? null) ?? kodikMeta.description,
    genres: mapGenres(anime, kodikMeta.genres),
    studios: mapStudios(anime, kodikMeta.studios),
    synonyms: anime?.synonyms?.slice(0, 6) ?? [],
    shikimoriUrl: anime ? shikimoriSiteUrl(anime.url) : null,
    screenshots: [
      ...new Set([
        ...(anime?.screenshots ?? [])
          .map((s) => shikimoriAssetUrl(s.original ?? s.preview))
          .filter((url): url is string => Boolean(url)),
        ...kodikScreenshots,
      ]),
    ],
    translations,
    hasShikimori: Boolean(anime),
    scoreCount: sumScoreVotes(anime?.rates_scores_stats),
    dubbers: collectDubbers(anime, translations),
  };
}

export const getAnimePageData = cache(async (shikimoriId: number): Promise<AnimePageDto | null> => {
  await getShikimoriEndpoints();

  const [materials, releasePoster] = await Promise.all([
    prisma.kodikMaterial.findMany({
      where: { shikimoriId },
      orderBy: { kodikUpdatedAt: "desc" },
      select: {
        kodikId: true,
        translationId: true,
        title: true,
        translationTitle: true,
        translationType: true,
        lastSeason: true,
        lastEpisode: true,
        episodesCount: true,
        playerLink: true,
        quality: true,
        materialData: true,
      },
    }),
    prisma.kodikEpisodeRelease.findFirst({
      where: { shikimoriId },
      orderBy: { releasedAt: "desc" },
      select: { posterUrl: true },
    }),
  ]);

  const hasRealMaterials = materials.some((m) => !isShikimoriStubMaterial(m.kodikId));

  let anime: ShikimoriAnime | null = null;
  if (hasRealMaterials) {
    anime = await getShikimoriAnimeCachedOnly(shikimoriId);
    scheduleShikimoriAnimeRefresh(shikimoriId);
  } else {
    anime = await getShikimoriAnime(shikimoriId);
  }

  if (!anime && materials.length === 0) return null;

  const translations: KodikTranslationDto[] = materials
    .filter((m) => !isShikimoriStubMaterial(m.kodikId))
    .map((m) => ({
      kodikId: m.kodikId,
      translationId: m.translationId,
      translationTitle: m.translationTitle,
      translationType: m.translationType,
      lastSeason: m.lastSeason,
      lastEpisode: m.lastEpisode,
      playerLink: normalizePlayerLink(m.playerLink),
      quality: m.quality,
    }));

  const materialsForMeta = materials.filter((m) => !isShikimoriStubMaterial(m.kodikId));
  const metaMaterials = materialsForMeta.length > 0 ? materialsForMeta : materials;

  const fallbackPoster =
    metaMaterials.map((m) => posterFromMaterialData(m.materialData)).find(Boolean) ??
    (releasePoster?.posterUrl && !isShikimoriMissingImage(releasePoster.posterUrl)
      ? releasePoster.posterUrl
      : null);
  const fallbackTitle = metaMaterials[0]?.title ?? materials[0]?.title ?? null;
  const kodikScreenshots = [
    ...new Set(metaMaterials.flatMap((m) => screenshotsFromMaterialData(m.materialData))),
  ];
  const kodikMeta = extractKodikMaterialMeta(metaMaterials.map((m) => m.materialData));

  let dto = mapAnimeToDto(
    shikimoriId,
    anime,
    translations,
    fallbackPoster,
    fallbackTitle,
    kodikScreenshots,
    kodikMeta,
    metaMaterials,
  );

  if (!dto.posterUrl) {
    const discovered = await discoverPosterUrl(shikimoriId);
    if (discovered) {
      dto = { ...dto, posterUrl: discovered.url };
    }
  }

  return dto;
});
