import {
  isShikimoriStubMaterial,
  shikimoriStubKodikId,
  SHIKIMORI_CACHE_TRANSLATION_TYPE,
} from "@/db/save-shikimori-material";
import { prisma } from "@/lib/prisma";
import type { ShikimoriAnime } from "@/lib/shikimori/types";

export const SHIKIMORI_ANIME_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ANIME_FULL_KEY = "anime_full";
const ANIME_FULL_SYNCED_AT_KEY = "anime_full_synced_at";

function parseSyncedAt(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>)[ANIME_FULL_SYNCED_AT_KEY];
  if (typeof raw !== "string") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function parseCachedAnime(data: unknown): ShikimoriAnime | null {
  if (!data || typeof data !== "object") return null;
  const anime = (data as Record<string, unknown>)[ANIME_FULL_KEY];
  if (!anime || typeof anime !== "object") return null;
  const id = (anime as ShikimoriAnime).id;
  if (typeof id !== "number" || id <= 0) return null;
  return anime as ShikimoriAnime;
}

export function isShikimoriAnimeCacheFresh(syncedAtMs: number | null): boolean {
  if (syncedAtMs === null) return false;
  return Date.now() - syncedAtMs < SHIKIMORI_ANIME_CACHE_TTL_MS;
}

export async function loadShikimoriAnimeFromCache(
  shikimoriId: number,
): Promise<ShikimoriAnime | null> {
  const row = await prisma.kodikMaterial.findUnique({
    where: { kodikId: shikimoriStubKodikId(shikimoriId) },
    select: { materialData: true },
  });

  const anime = parseCachedAnime(row?.materialData);
  if (!anime) return null;

  const syncedAt = parseSyncedAt(row?.materialData);
  if (!isShikimoriAnimeCacheFresh(syncedAt)) return null;

  return anime;
}

function yearFromShikimoriDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export async function persistShikimoriAnimeCache(anime: ShikimoriAnime): Promise<void> {
  const syncedAt = new Date().toISOString();
  const title = anime.russian || anime.name;
  const year = yearFromShikimoriDate(anime.aired_on ?? anime.released_on);

  await prisma.kodikMaterial.upsert({
    where: { kodikId: shikimoriStubKodikId(anime.id) },
    create: {
      kodikId: shikimoriStubKodikId(anime.id),
      shikimoriId: anime.id,
      type: anime.kind ?? "anime",
      title,
      titleOrig: anime.name,
      year,
      translationId: 0,
      translationTitle: "Shikimori",
      translationType: SHIKIMORI_CACHE_TRANSLATION_TYPE,
      kodikUpdatedAt: new Date(),
      materialData: {
        source: "shikimori",
        [ANIME_FULL_KEY]: anime,
        [ANIME_FULL_SYNCED_AT_KEY]: syncedAt,
        anime_title: title,
        anime_kind: anime.kind ?? null,
        anime_status: anime.status ?? null,
        shikimori_episodes: anime.episodes ?? null,
        year,
      },
    },
    update: {
      title,
      titleOrig: anime.name,
      type: anime.kind ?? "anime",
      year,
      kodikUpdatedAt: new Date(),
      materialData: {
        source: "shikimori",
        [ANIME_FULL_KEY]: anime,
        [ANIME_FULL_SYNCED_AT_KEY]: syncedAt,
        anime_title: title,
        anime_kind: anime.kind ?? null,
        anime_status: anime.status ?? null,
        shikimori_episodes: anime.episodes ?? null,
        year,
      },
    },
  });
}

export function parseShikimoriAnimeFromMaterialData(data: unknown): ShikimoriAnime | null {
  return parseCachedAnime(data);
}

export async function loadShikimoriAnimeCacheBatch(
  shikimoriIds: number[],
  options?: { allowStale?: boolean },
): Promise<Map<number, ShikimoriAnime>> {
  const unique = [...new Set(shikimoriIds)];
  if (unique.length === 0) return new Map();

  const rows = await prisma.kodikMaterial.findMany({
    where: { kodikId: { in: unique.map(shikimoriStubKodikId) } },
    select: { shikimoriId: true, materialData: true },
  });

  const result = new Map<number, ShikimoriAnime>();
  for (const row of rows) {
    if (row.shikimoriId == null) continue;

    const anime = parseCachedAnime(row.materialData);
    if (!anime) continue;

    if (!options?.allowStale) {
      const syncedAt = parseSyncedAt(row.materialData);
      if (!isShikimoriAnimeCacheFresh(syncedAt)) continue;
    }

    result.set(row.shikimoriId, anime);
  }

  return result;
}

export async function loadStaleShikimoriAnimeFromCache(
  shikimoriId: number,
): Promise<ShikimoriAnime | null> {
  const row = await prisma.kodikMaterial.findUnique({
    where: { kodikId: shikimoriStubKodikId(shikimoriId) },
    select: { materialData: true, kodikId: true },
  });

  if (!row || !isShikimoriStubMaterial(row.kodikId)) return null;
  return parseCachedAnime(row.materialData);
}
