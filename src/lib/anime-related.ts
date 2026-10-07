import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import { loadShikimoriAnimeCacheBatch } from "@/lib/shikimori/anime-cache";
import {
  fetchShikimoriFranchise,
  mapFranchiseChronology,
  mapFranchiseSeasons,
  type ShikimoriFranchiseResponse,
} from "@/lib/shikimori/franchise";
import {
  fetchShikimoriRelatedEntries,
  getShikimoriRelatedAnimes,
  mapShikimoriRelatedEntries,
  type ShikimoriRelatedAnimeBrief,
} from "@/lib/shikimori/related";
import {
  fetchShikimoriSimilarAnimes,
  mapShikimoriSimilarAnimes,
} from "@/lib/shikimori/similar";
import {
  loadRelationSnapshot,
  persistRelationSnapshot,
  RELATION_SNAPSHOT_KIND,
} from "@/lib/shikimori/relation-snapshot";
import {
  isShikimoriRateLimitError,
  isShikimoriTransientFetchError,
  shikimoriAssetUrl,
} from "@/lib/shikimori/client";
import type { ShikimoriAnimeBrief, ShikimoriRelatedEntry } from "@/lib/shikimori/types";
import type { Prisma } from "@prisma/client";

export type RelatedAnimeDto = ShikimoriRelatedAnimeBrief;

export type RelatedAnimeMode = "seasons" | "chronology" | "direct";

export type RelatedAnimesBundle = {
  seasons: RelatedAnimeDto[];
  chronology: RelatedAnimeDto[];
  direct: RelatedAnimeDto[];
};

const NON_CRITICAL_SHIKIMORI_TIMEOUT_MS = 2_500;

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

function isSoftShikimoriError(error: unknown): boolean {
  return isShikimoriRateLimitError(error) || isShikimoriTransientFetchError(error);
}

function nonCriticalShikimoriInit(): RequestInit {
  return { signal: AbortSignal.timeout(NON_CRITICAL_SHIKIMORI_TIMEOUT_MS) };
}

function parseRelatedPayload(payload: unknown): ShikimoriRelatedEntry[] | null {
  if (!Array.isArray(payload)) return null;
  return payload as ShikimoriRelatedEntry[];
}

function parseFranchisePayload(payload: unknown): ShikimoriFranchiseResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const nodes = (payload as ShikimoriFranchiseResponse).nodes;
  if (!Array.isArray(nodes)) return null;
  return payload as ShikimoriFranchiseResponse;
}

function parseSimilarPayload(payload: unknown): ShikimoriAnimeBrief[] | null {
  if (!Array.isArray(payload)) return null;
  return payload as ShikimoriAnimeBrief[];
}

function emptyFranchise(shikimoriId: number): ShikimoriFranchiseResponse {
  return { links: [], nodes: [], current_id: shikimoriId };
}

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

async function buildBundleFromPayloads(
  shikimoriId: number,
  relatedEntries: ShikimoriRelatedEntry[] | null,
  franchise: ShikimoriFranchiseResponse | null,
): Promise<RelatedAnimesBundle> {
  const directRaw = mapShikimoriRelatedEntries(relatedEntries, shikimoriId);
  const franchiseSeasons = franchise?.nodes?.length ? mapFranchiseSeasons(franchise) : [];
  const franchiseChronology = franchise?.nodes?.length ? mapFranchiseChronology(franchise) : [];

  const [direct, seasonsRaw, chronology] = await Promise.all([
    enrichRelatedBriefs(directRaw),
    enrichRelatedBriefs(franchiseSeasons),
    enrichRelatedBriefs(franchiseChronology),
  ]);

  return {
    seasons: seasonsRaw.filter((item) => isSeasonOrMovieKind(item.kind)),
    chronology,
    direct,
  };
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

/**
 * Связанные аниме: Postgres snapshot first (allow stale), Shikimori refresh when stale/miss.
 */
export async function getRelatedAnimesBundle(shikimoriId: number): Promise<RelatedAnimesBundle> {
  const [relatedSnap, franchiseSnap] = await Promise.all([
    loadRelationSnapshot(shikimoriId, RELATION_SNAPSHOT_KIND.related),
    loadRelationSnapshot(shikimoriId, RELATION_SNAPSHOT_KIND.franchise),
  ]);

  let relatedEntries = parseRelatedPayload(relatedSnap?.payload);
  let franchise = parseFranchisePayload(franchiseSnap?.payload);

  const needRelated = !relatedSnap?.fresh || relatedEntries == null;
  const needFranchise = !franchiseSnap?.fresh || franchise == null;

  if (needRelated) {
    try {
      const fetched = await fetchShikimoriRelatedEntries(shikimoriId, nonCriticalShikimoriInit());
      const payload = (fetched ?? []) as Prisma.InputJsonValue;
      await persistRelationSnapshot(shikimoriId, RELATION_SNAPSHOT_KIND.related, payload);
      relatedEntries = parseRelatedPayload(payload);
    } catch (error) {
      if (!isSoftShikimoriError(error)) throw error;
      console.warn("[anime-related] direct unavailable:", shikimoriId);
    }
  }

  if (needFranchise) {
    try {
      const fetched = await fetchShikimoriFranchise(shikimoriId, nonCriticalShikimoriInit());
      const payload = (fetched ?? emptyFranchise(shikimoriId)) as Prisma.InputJsonValue;
      await persistRelationSnapshot(shikimoriId, RELATION_SNAPSHOT_KIND.franchise, payload);
      franchise = parseFranchisePayload(payload);
    } catch (error) {
      if (!isSoftShikimoriError(error)) throw error;
      console.warn("[anime-related] franchise unavailable:", shikimoriId);
    }
  }

  if (relatedEntries == null && franchise == null) {
    return EMPTY_RELATED_BUNDLE;
  }

  return buildBundleFromPayloads(shikimoriId, relatedEntries, franchise);
}

/** @deprecated Используйте getRelatedAnimesDirect или getRelatedAnimesBundle */
export async function getRelatedAnimes(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  return getRelatedAnimesDirect(shikimoriId);
}

/**
 * Похожие аниме: Postgres snapshot first (allow stale), Shikimori refresh when stale/miss.
 */
export async function getSimilarAnimes(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  const snap = await loadRelationSnapshot(shikimoriId, RELATION_SNAPSHOT_KIND.similar);
  let similarItems = parseSimilarPayload(snap?.payload);

  if (!snap?.fresh || similarItems == null) {
    try {
      const fetched = await fetchShikimoriSimilarAnimes(shikimoriId, nonCriticalShikimoriInit());
      const payload = (fetched ?? []) as Prisma.InputJsonValue;
      await persistRelationSnapshot(shikimoriId, RELATION_SNAPSHOT_KIND.similar, payload);
      similarItems = parseSimilarPayload(payload);
    } catch (error) {
      if (!isSoftShikimoriError(error)) throw error;
      console.warn("[anime-related] similar unavailable:", shikimoriId);
    }
  }

  if (similarItems == null) return [];
  return enrichRelatedBriefs(mapShikimoriSimilarAnimes(similarItems, shikimoriId));
}
