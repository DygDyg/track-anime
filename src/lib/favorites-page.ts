import {
  animeBriefPosterUrl,
  animeBriefTitle,
  fetchAnimesByIds,
  type ShikimoriAnimeBrief,
} from "@/lib/shikimori/animes-batch";
import {
  favoriteAnimePosterUrl,
  favoriteAnimeTitle,
  type ShikimoriFavoriteAnimeBrief,
} from "@/lib/shikimori/favorites";
import {
  getFavoritesPayloadForPage,
  loadFavoritesPayloadFromDb,
  type FavoritesSyncPayload,
  type FavoritesSyncStatus,
} from "@/lib/favorites-sync";
import {
  LIST_STATUS_TABS,
  type ListStatusTab,
  type ShikimoriUserRate,
} from "@/lib/shikimori/user-rates";
import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";

export type FavoriteAnimeItem = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  posterUrl: string | null;
  kind: string | null;
  status: string | null;
  score: string | null;
  episodes: number | null;
  listStatus: string | null;
  userScore: number | null;
  watchedEpisodes: number | null;
};

export type FavoritesPageData = {
  tab: ListStatusTab;
  items: FavoriteAnimeItem[];
  counts: Record<string, number>;
  mangaBookmarkCount: number;
  sync: FavoritesSyncStatus;
};

export type FavoritesAllData = {
  tabs: Record<ListStatusTab, FavoriteAnimeItem[]>;
  counts: Record<string, number>;
  mangaBookmarkCount: number;
  sync: FavoritesSyncStatus;
  shouldBackgroundSync: boolean;
};

export type { FavoritesSyncStatus } from "@/lib/favorites-sync";

const FAVORITES_SHIKIMORI_BRIEF_LIMIT = 80;

type KodikBriefRow = {
  shikimoriId: number;
  title: string;
  titleOrig: string | null;
  materialData: unknown;
};

type AnimeBrief = {
  title: string;
  titleOriginal: string | null;
  posterUrl: string | null;
  kind: string | null;
  status: string | null;
  score: string | null;
  episodes: number | null;
};

function normalizePoster(url: string | null | undefined): string | null {
  return resolveMaterialPosterUrl({ anime_poster_url: url });
}

function posterFromMaterialData(data: MaterialPosterSource | null): string | null {
  return resolveMaterialPosterUrl(data);
}

function mapBookmark(item: ShikimoriFavoriteAnimeBrief, brief?: AnimeBrief): FavoriteAnimeItem {
  const title = item.name ? favoriteAnimeTitle(item) : brief?.title ?? `Аниме #${item.id}`;
  return {
    shikimoriId: item.id,
    title,
    titleOriginal:
      brief?.titleOriginal ?? (item.name && item.name !== title ? item.name : null),
    posterUrl: favoriteAnimePosterUrl(item.image) ?? brief?.posterUrl ?? null,
    kind: item.kind ?? brief?.kind ?? null,
    status: item.status ?? brief?.status ?? null,
    score: item.score ?? brief?.score ?? null,
    episodes: item.episodes ?? brief?.episodes ?? null,
    listStatus: null,
    userScore: null,
    watchedEpisodes: null,
  };
}

function mapRate(rate: ShikimoriUserRate, brief?: AnimeBrief): FavoriteAnimeItem {
  const title = brief?.title ?? `Аниме #${rate.target_id}`;
  const titleOriginal = brief?.titleOriginal;
  return {
    shikimoriId: rate.target_id,
    title,
    titleOriginal: titleOriginal && titleOriginal !== title ? titleOriginal : null,
    posterUrl: brief?.posterUrl ?? null,
    kind: brief?.kind ?? null,
    status: brief?.status ?? null,
    score: brief?.score ?? null,
    episodes: brief?.episodes ?? null,
    listStatus: rate.status,
    userScore: rate.score > 0 ? rate.score : null,
    watchedEpisodes: rate.episodes > 0 ? rate.episodes : null,
  };
}

function shikimoriBriefToAnimeBrief(item: ShikimoriAnimeBrief): AnimeBrief {
  const title = animeBriefTitle(item);
  return {
    title,
    titleOriginal: item.name !== title ? item.name : null,
    posterUrl: animeBriefPosterUrl(item.image),
    kind: item.kind ?? null,
    status: item.status ?? null,
    score: item.score ?? null,
    episodes: item.episodes ?? null,
  };
}

async function fetchKodikBriefsByShikimoriIds(ids: number[]): Promise<Map<number, AnimeBrief>> {
  const unique = [...new Set(ids.filter((id) => id > 0))];
  const map = new Map<number, AnimeBrief>();
  if (unique.length === 0) return map;

  const rows = await prisma.$queryRaw<KodikBriefRow[]>`
    SELECT DISTINCT ON (m."shikimoriId")
      m."shikimoriId",
      m.title,
      m."titleOrig",
      m."materialData"
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" = ANY(${unique})
    ORDER BY
      m."shikimoriId",
      CASE WHEN m."kodikId" LIKE 'shikimori:%' THEN 1 ELSE 0 END,
      m."kodikUpdatedAt" DESC NULLS LAST
  `;

  for (const material of rows) {
    const id = material.shikimoriId;
    if (map.has(id)) continue;

    const data = material.materialData as (MaterialPosterSource & {
      anime_title?: string;
      anime_kind?: string;
      anime_status?: string;
      shikimori_score?: string | null;
      shikimori_episodes?: number | null;
    }) | null;

    const title = data?.anime_title?.trim() || material.title;
    map.set(id, {
      title,
      titleOriginal: material.titleOrig?.trim() || null,
      posterUrl: posterFromMaterialData(data),
      kind: data?.anime_kind ?? null,
      status: data?.anime_status ?? null,
      score: data?.shikimori_score ?? null,
      episodes: data?.shikimori_episodes ?? null,
    });
  }

  return map;
}

async function fetchAnimeBriefsByShikimoriIds(ids: number[]): Promise<Map<number, AnimeBrief>> {
  const briefs = await fetchKodikBriefsByShikimoriIds(ids);
  const unique = [...new Set(ids.filter((id) => id > 0))];
  const missing = unique.filter((id) => !briefs.has(id));
  if (missing.length === 0) return briefs;

  const limited = missing.slice(0, FAVORITES_SHIKIMORI_BRIEF_LIMIT);

  try {
    const fromShikimori = await fetchAnimesByIds(limited);
    for (const [id, item] of fromShikimori) {
      briefs.set(id, shikimoriBriefToAnimeBrief(item));
    }
  } catch (err) {
    console.error("[favorites] Shikimori anime briefs fallback skipped:", err);
  }

  return briefs;
}

function buildFavoritesAllData(
  payload: FavoritesSyncPayload,
  briefsById: Map<number, AnimeBrief>,
  shouldBackgroundSync: boolean,
): FavoritesAllData {
  const { rates, favourites, sync, mangaBookmarkCount } = payload;
  const bookmarkPayload = favourites.animes ?? [];
  const counts = buildCounts(rates, bookmarkPayload.length);

  const bookmarks = bookmarkPayload.map((item) => mapBookmark(item, briefsById.get(item.id)));
  const tabs = buildTabsFromRates(rates, bookmarks, briefsById);

  return {
    tabs,
    counts,
    mangaBookmarkCount,
    sync,
    shouldBackgroundSync,
  };
}

async function enrichFavoritesPayload(
  payload: FavoritesSyncPayload,
  shouldBackgroundSync: boolean,
): Promise<FavoritesAllData> {
  const allIds = [
    ...new Set([
      ...(payload.favourites.animes ?? []).map((item) => item.id),
      ...payload.rates.map((rate) => rate.target_id),
    ]),
  ];
  const briefsById = await fetchAnimeBriefsByShikimoriIds(allIds);
  return buildFavoritesAllData(payload, briefsById, shouldBackgroundSync);
}

/** Списки напрямую с Shikimori (без локального кеша пользователя). */
export async function buildFavoritesFromShikimoriPayload(
  payload: FavoritesSyncPayload,
): Promise<FavoritesAllData> {
  return enrichFavoritesPayload(payload, false);
}

export async function getAllFavoritesData(
  userId: string,
  shikimoriUserId: number,
): Promise<FavoritesAllData> {
  const { payload, shouldBackgroundSync } = await getFavoritesPayloadForPage(userId, shikimoriUserId);
  return enrichFavoritesPayload(payload, shouldBackgroundSync);
}

/** Публичные списки — только локальный кеш, без синхронизации с Shikimori. */
export async function getPublicFavoritesData(
  userId: string,
  shikimoriUserId: number,
): Promise<FavoritesAllData | null> {
  const payload = await loadFavoritesPayloadFromDb(userId, shikimoriUserId);
  if (!payload) return null;
  return enrichFavoritesPayload(payload, false);
}

function buildCounts(rates: ShikimoriUserRate[], bookmarkCount: number): Record<string, number> {
  const counts: Record<string, number> = {
    bookmarks: bookmarkCount,
    all: rates.length,
  };
  for (const status of LIST_STATUS_TABS) {
    counts[status] = rates.filter((rate) => rate.status === status).length;
  }
  return counts;
}

export function parseFavoritesTab(value: string | undefined): ListStatusTab {
  if (value === "bookmarks" || value === "all") return value;
  if (LIST_STATUS_TABS.includes(value as (typeof LIST_STATUS_TABS)[number])) {
    return value as ListStatusTab;
  }
  return "watching";
}

function parseRateTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function sortRatesByUpdatedDesc(rates: ShikimoriUserRate[]): ShikimoriUserRate[] {
  return [...rates].sort((a, b) => {
    const aMs = parseRateTimestamp(a.updated_at) ?? parseRateTimestamp(a.created_at) ?? 0;
    const bMs = parseRateTimestamp(b.updated_at) ?? parseRateTimestamp(b.created_at) ?? 0;
    return bMs - aMs;
  });
}

function buildTabsFromRates(
  rates: ShikimoriUserRate[],
  bookmarks: FavoriteAnimeItem[],
  briefsById: Map<number, AnimeBrief>,
): Record<ListStatusTab, FavoriteAnimeItem[]> {
  const rateItems = sortRatesByUpdatedDesc(rates).map((rate) =>
    mapRate(rate, briefsById.get(rate.target_id)),
  );
  const tabs = {
    bookmarks,
    all: rateItems,
  } as Record<ListStatusTab, FavoriteAnimeItem[]>;

  for (const status of LIST_STATUS_TABS) {
    tabs[status] = rateItems.filter((item) => item.listStatus === status);
  }

  return tabs;
}

export async function getFavoritesPageData(
  userId: string,
  shikimoriUserId: number,
  tab: ListStatusTab,
): Promise<FavoritesPageData> {
  const data = await getAllFavoritesData(userId, shikimoriUserId);
  return {
    tab,
    items: data.tabs[tab],
    counts: data.counts,
    mangaBookmarkCount: data.mangaBookmarkCount,
    sync: data.sync,
  };
}

export function serializeFavoriteAnimeItem(item: FavoriteAnimeItem): FavoriteAnimeItem {
  return item;
}

export async function getUserFavorites(userId: string, shikimoriUserId: number) {
  const data = await getAllFavoritesData(userId, shikimoriUserId);
  return {
    animes: data.tabs.bookmarks,
    mangaCount: data.mangaBookmarkCount,
  };
}
