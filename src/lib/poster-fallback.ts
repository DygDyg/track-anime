import {
  DEFAULT_COVER_SOURCE_ORDER,
  listEnabledCoverSources,
  type CoverSourceId,
  type CoverSourceOrderConfig,
} from "@/lib/admin/cover-cache-sources";
import { fetchCvhPosterUrlByMalId } from "@/lib/cvh-content-api";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { shouldUpgradeImageToHttps } from "@/lib/poster";
import { prisma } from "@/lib/prisma";
import { kodikSearch } from "@/kodik/client";
import { isShikimoriMissingImage, shikimoriAssetUrl, shikimoriFetch } from "@/lib/shikimori/client";
import { lookupCachedMalIdForShikimoriId } from "@/lib/shikimori/mal-id";
import type { ShikimoriAnime, ShikimoriImage, ShikimoriVideo } from "@/lib/shikimori/types";

export type PosterFallbackSource =
  | "url"
  | "kodik"
  | "material_db"
  | "release_db"
  | "shikimori"
  | "shikimori_video"
  | "cvh"
  | "worldart";

export type PosterCandidate = {
  url: string;
  source: PosterFallbackSource;
};

function normalizePosterUrl(url: string | null | undefined): string | null {
  if (!url || isShikimoriMissingImage(url)) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!shouldUpgradeImageToHttps(trimmed)) return trimmed;
  return trimmed.replace(/^http:\/\//i, "https://");
}

function posterFromShikimoriImage(image: ShikimoriImage | null | undefined): string | null {
  if (!image) return null;
  return (
    shikimoriAssetUrl(image.original) ??
    shikimoriAssetUrl(image.preview) ??
    shikimoriAssetUrl(image.x96) ??
    shikimoriAssetUrl(image.x48)
  );
}

function posterFromVideos(videos: ShikimoriVideo[] | null | undefined): string | null {
  if (!videos?.length) return null;

  const ranked = [...videos].sort((a, b) => {
    const score = (kind?: string) => {
      const value = kind?.toLowerCase() ?? "";
      if (value === "pv" || value === "promo") return 0;
      if (value === "op" || value === "ed") return 1;
      return 2;
    };
    return score(a.kind) - score(b.kind);
  });

  for (const video of ranked) {
    const url = normalizePosterUrl(video.image_url);
    if (url) return url;
  }

  return null;
}

function pushCandidate(
  list: PosterCandidate[],
  seen: Set<string>,
  url: string | null | undefined,
  source: PosterFallbackSource,
) {
  const normalized = normalizePosterUrl(url);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  list.push({ url: normalized, source });
}

async function candidatesFromKodik(
  shikimoriId: number,
  seen: Set<string>,
  list: PosterCandidate[],
) {
  try {
    const data = await kodikSearch({
      shikimori_id: shikimoriId,
      with_material_data: true,
      limit: 1,
    });
    const result = data.results[0];
    if (!result) return;

    pushCandidate(list, seen, result.material_data?.anime_poster_url, "kodik");
    pushCandidate(list, seen, result.material_data?.poster_url, "kodik");
    pushCandidate(list, seen, result.material_data?.worldart_poster_url, "kodik");
  } catch {
    /* Kodik недоступен */
  }
}

async function candidatesFromDb(
  shikimoriId: number,
  seen: Set<string>,
  list: PosterCandidate[],
) {
  const [materials, release] = await Promise.all([
    prisma.kodikMaterial.findMany({
      where: { shikimoriId },
      orderBy: { kodikUpdatedAt: "desc" },
      select: { materialData: true },
      take: 5,
    }),
    prisma.kodikEpisodeRelease.findFirst({
      where: { shikimoriId },
      orderBy: { releasedAt: "desc" },
      select: { posterUrl: true },
    }),
  ]);

  for (const material of materials) {
    if (!material.materialData || typeof material.materialData !== "object") continue;
    const poster = resolveMaterialPosterUrl(material.materialData as MaterialPosterSource);
    pushCandidate(list, seen, poster, "material_db");
  }

  pushCandidate(list, seen, release?.posterUrl ?? null, "release_db");
}

async function candidatesFromShikimori(
  shikimoriId: number,
  seen: Set<string>,
  list: PosterCandidate[],
) {
  try {
    const anime = await shikimoriFetch<ShikimoriAnime>(`/animes/${shikimoriId}`);
    if (!anime) return;

    pushCandidate(list, seen, posterFromShikimoriImage(anime.image), "shikimori");
    pushCandidate(list, seen, posterFromVideos(anime.videos), "shikimori_video");
  } catch {
    /* Shikimori недоступен / rate limit */
  }
}

async function candidatesFromCvh(
  shikimoriId: number,
  seen: Set<string>,
  list: PosterCandidate[],
) {
  try {
    const malId = await lookupCachedMalIdForShikimoriId(shikimoriId);
    if (!malId) return;
    const posterUrl = await fetchCvhPosterUrlByMalId(malId);
    pushCandidate(list, seen, posterUrl, "cvh");
  } catch {
    /* CVH недоступен */
  }
}

/**
 * Кандидаты одного источника (без worldart — он качает HTML отдельно в cover-cache).
 */
export async function collectPosterCandidatesFromSource(options: {
  sourceId: CoverSourceId;
  shikimoriId: number;
  directUrl?: string | null;
  seen?: Set<string>;
}): Promise<PosterCandidate[]> {
  const { sourceId, shikimoriId, directUrl } = options;
  const list: PosterCandidate[] = [];
  const seen = options.seen ?? new Set<string>();

  switch (sourceId) {
    case "url":
      pushCandidate(list, seen, directUrl, "url");
      break;
    case "kodik":
      await candidatesFromKodik(shikimoriId, seen, list);
      break;
    case "material_db":
      await candidatesFromDb(shikimoriId, seen, list);
      break;
    case "shikimori":
      await candidatesFromShikimori(shikimoriId, seen, list);
      break;
    case "cvh":
      await candidatesFromCvh(shikimoriId, seen, list);
      break;
    case "worldart":
      break;
    default:
      break;
  }

  return list;
}

/** Быстрый поиск только по локальной БД — без Kodik/Shikimori/CVH API. */
export async function discoverPosterCandidatesQuick(
  shikimoriId: number,
  directUrl?: string | null,
): Promise<PosterCandidate[]> {
  const list: PosterCandidate[] = [];
  const seen = new Set<string>();

  pushCandidate(list, seen, directUrl, "url");
  await candidatesFromDb(shikimoriId, seen, list);
  return list;
}

export async function discoverPosterUrlQuick(
  shikimoriId: number,
  directUrl?: string | null,
): Promise<PosterCandidate | null> {
  const candidates = await discoverPosterCandidatesQuick(shikimoriId, directUrl);
  return candidates[0] ?? null;
}

/**
 * Источники по админскому порядку с early-exit:
 * как только источник дал ≥1 URL — дальше не ходим.
 * worldart в URL-resolve пропускается (нужен HTML-download в cover-cache).
 */
export async function discoverPosterCandidates(
  shikimoriId: number,
  directUrl?: string | null,
  sourceOrder: CoverSourceOrderConfig = DEFAULT_COVER_SOURCE_ORDER,
): Promise<PosterCandidate[]> {
  const out: PosterCandidate[] = [];
  const seenUrls = new Set<string>();

  for (const sourceId of listEnabledCoverSources(sourceOrder)) {
    if (sourceId === "worldart") continue;
    const batch = await collectPosterCandidatesFromSource({
      sourceId,
      shikimoriId,
      directUrl,
      seen: seenUrls,
    });
    out.push(...batch);
    if (out.length > 0) break;
  }

  return out;
}

export async function discoverPosterUrl(
  shikimoriId: number,
  directUrl?: string | null,
  sourceOrder?: CoverSourceOrderConfig,
): Promise<PosterCandidate | null> {
  const candidates = await discoverPosterCandidates(shikimoriId, directUrl, sourceOrder);
  return candidates[0] ?? null;
}

export function posterFromShikimoriAnime(anime: ShikimoriAnime | null | undefined): string | null {
  if (!anime) return null;
  return posterFromShikimoriImage(anime.image) ?? posterFromVideos(anime.videos);
}
