import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import { loadShikimoriAnimeCacheBatch } from "@/lib/shikimori/anime-cache";
import {
  fetchShikimoriFranchise,
  mapFranchiseChronology,
  mapFranchiseSeasons,
} from "@/lib/shikimori/franchise";
import {
  getShikimoriRelatedAnimes,
  type ShikimoriRelatedAnimeBrief,
} from "@/lib/shikimori/related";
import { getShikimoriSimilarAnimes } from "@/lib/shikimori/similar";
import { isShikimoriRateLimitError, shikimoriAssetUrl } from "@/lib/shikimori/client";

export type RelatedAnimeDto = ShikimoriRelatedAnimeBrief;

export type RelatedAnimeMode = "seasons" | "chronology" | "direct";

export type RelatedAnimesBundle = {
  seasons: RelatedAnimeDto[];
  chronology: RelatedAnimeDto[];
  direct: RelatedAnimeDto[];
};

const RELATED_BUNDLE_CACHE_SECONDS = 7 * 24 * 60 * 60; // 7 дней — сезоны/хронология/напрямую
const SIMILAR_CACHE_SECONDS = 3600;

const SEASON_MOVIE_KINDS = new Set(["tv", "movie"]);

function isSeasonOrMovieKind(kind: string | null): boolean {
  if (!kind) return true;
  return SEASON_MOVIE_KINDS.has(kind.toLowerCase());
}

function posterFromMaterialData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  return resolveMaterialPosterUrl(data as MaterialPosterSource);
}

type MaterialRow = {
  shikimoriId: number;
  kodikId: string;
  lastSeason: number | null;
  lastEpisode: number | null;
  materialData: unknown;
};

async function mergeShikimoriCache(
  items: ShikimoriRelatedAnimeBrief[],
): Promise<ShikimoriRelatedAnimeBrief[]> {
  if (items.length === 0) return items;

  const cache = await loadShikimoriAnimeCacheBatch(
    items.map((item) => item.shikimoriId),
    { allowStale: true },
  );

  return items.map((item) => {
    const cached = cache.get(item.shikimoriId);
    if (!cached) return item;

    const posterFromCache =
      shikimoriAssetUrl(cached.image?.preview) ??
      shikimoriAssetUrl(cached.image?.x96) ??
      shikimoriAssetUrl(cached.image?.original);

    return {
      ...item,
      title: item.title || cached.russian || cached.name,
      posterUrl: item.posterUrl ?? posterFromCache,
      kind: item.kind ?? cached.kind ?? null,
      status: item.status ?? cached.status ?? null,
      score: item.score ?? (cached.score != null ? String(cached.score) : null),
      episodes: item.episodes ?? (cached.episodes && cached.episodes > 0 ? cached.episodes : null),
      airedOn: item.airedOn ?? cached.aired_on ?? null,
      releasedOn: item.releasedOn ?? cached.released_on ?? null,
    };
  });
}

async function enrichRelatedBriefs(items: ShikimoriRelatedAnimeBrief[]): Promise<RelatedAnimeDto[]> {
  if (items.length === 0) return [];

  const withCache = await mergeShikimoriCache(items);
  const ids = withCache.map((item) => item.shikimoriId);

  const materials = await prisma.kodikMaterial.findMany({
    where: { shikimoriId: { in: ids } },
    orderBy: { kodikUpdatedAt: "desc" },
    select: {
      shikimoriId: true,
      kodikId: true,
      lastSeason: true,
      lastEpisode: true,
      materialData: true,
    },
  });

  const posterById = new Map<number, string>();
  const materialByShikimoriId = new Map<number, MaterialRow>();
  for (const material of materials) {
    if (!material.shikimoriId) continue;

    if (!posterById.has(material.shikimoriId)) {
      const poster = posterFromMaterialData(material.materialData);
      if (poster) posterById.set(material.shikimoriId, poster);
    }

    if (!materialByShikimoriId.has(material.shikimoriId)) {
      materialByShikimoriId.set(material.shikimoriId, {
        shikimoriId: material.shikimoriId,
        kodikId: material.kodikId,
        lastSeason: material.lastSeason,
        lastEpisode: material.lastEpisode,
        materialData: material.materialData,
      });
    }
  }

  const episodeMaterials = [...materialByShikimoriId.values()];
  const episodes =
    episodeMaterials.length > 0
      ? await prisma.kodikEpisode.findMany({
          where: {
            OR: episodeMaterials.map((material) => ({
              materialId: material.kodikId,
              seasonNumber: material.lastSeason ?? 1,
              episodeNumber: material.lastEpisode ?? 1,
            })),
          },
          select: {
            materialId: true,
            seasonNumber: true,
            episodeNumber: true,
            screenshots: true,
          },
        })
      : [];

  const episodeScreenshotByKey = new Map(
    episodes.map((episode) => [
      `${episode.materialId}:${episode.seasonNumber}:${episode.episodeNumber}`,
      episode.screenshots,
    ]),
  );

  return withCache.map((item) => {
    const material = materialByShikimoriId.get(item.shikimoriId);
    const materialData = material?.materialData as { screenshots?: unknown } | undefined;
    const episodeScreenshots = material
      ? episodeScreenshotByKey.get(
          `${material.kodikId}:${material.lastSeason ?? 1}:${material.lastEpisode ?? 1}`,
        )
      : undefined;

    return {
      ...item,
      posterUrl: item.posterUrl ?? posterById.get(item.shikimoriId) ?? null,
      screenshotUrl: pickScreenshotUrl(
        [materialData?.screenshots, episodeScreenshots],
        String(item.shikimoriId),
      ),
    };
  });
}

/** Напрямую — только прямые связи из /related (без манги). */
export async function getRelatedAnimesDirect(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  const related = await getShikimoriRelatedAnimes(shikimoriId);
  return enrichRelatedBriefs(related);
}

/** Сезоны — основная линия, только сериалы и фильмы. */
export async function getRelatedAnimesSeasons(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  const franchise = await fetchShikimoriFranchise(shikimoriId);
  if (!franchise?.nodes?.length) return [];
  const items = await enrichRelatedBriefs(mapFranchiseSeasons(franchise));
  return items.filter((item) => isSeasonOrMovieKind(item.kind));
}

/** Хронология — вся франшиза по порядку выхода. */
export async function getRelatedAnimesChronology(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  const franchise = await fetchShikimoriFranchise(shikimoriId);
  if (!franchise?.nodes?.length) return [];
  return enrichRelatedBriefs(mapFranchiseChronology(franchise));
}

const EMPTY_RELATED_BUNDLE: RelatedAnimesBundle = {
  seasons: [],
  chronology: [],
  direct: [],
};

async function getRelatedAnimesBundleUncached(shikimoriId: number): Promise<RelatedAnimesBundle> {
  const directRaw = await getShikimoriRelatedAnimes(shikimoriId);
  const franchise = await fetchShikimoriFranchise(shikimoriId);

  const franchiseSeasons = franchise?.nodes?.length ? mapFranchiseSeasons(franchise) : [];
  const franchiseChronology = franchise?.nodes?.length ? mapFranchiseChronology(franchise) : [];

  const [direct, seasonsRaw, chronology] = await Promise.all([
    enrichRelatedBriefs(directRaw),
    enrichRelatedBriefs(franchiseSeasons),
    enrichRelatedBriefs(franchiseChronology),
  ]);

  const seasons = seasonsRaw.filter((item) => isSeasonOrMovieKind(item.kind));

  return { seasons, chronology, direct };
}

export async function getRelatedAnimesBundle(shikimoriId: number): Promise<RelatedAnimesBundle> {
  try {
    return await unstable_cache(
      async () => getRelatedAnimesBundleUncached(shikimoriId),
      ["related-animes-bundle", String(shikimoriId)],
      { revalidate: RELATED_BUNDLE_CACHE_SECONDS, tags: [`related-animes-${shikimoriId}`] },
    )();
  } catch (error) {
    if (isShikimoriRateLimitError(error)) return EMPTY_RELATED_BUNDLE;
    throw error;
  }
}

/** @deprecated Используйте getRelatedAnimesDirect или getRelatedAnimesBundle */
export async function getRelatedAnimes(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  return getRelatedAnimesDirect(shikimoriId);
}

/** Похожие аниме из Shikimori /similar. */
async function getSimilarAnimesUncached(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  const similar = await getShikimoriSimilarAnimes(shikimoriId);
  return enrichRelatedBriefs(similar);
}

export async function getSimilarAnimes(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  try {
    return await unstable_cache(
      async () => getSimilarAnimesUncached(shikimoriId),
      ["similar-animes", String(shikimoriId)],
      { revalidate: SIMILAR_CACHE_SECONDS, tags: [`similar-animes-${shikimoriId}`] },
    )();
  } catch (error) {
    if (isShikimoriRateLimitError(error)) {
      console.warn("[anime-related] similar rate limited:", shikimoriId);
      return getSimilarAnimesUncached(shikimoriId).catch(() => []);
    }
    throw error;
  }
}
