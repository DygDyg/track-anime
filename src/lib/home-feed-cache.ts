import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  queryCatalogReleasesPerTitle,
  queryFreshReleasesPerTitle,
  serializeRelease,
  type ReleaseItem,
  type ReleaseItemDto,
  type ReleasesCursor,
} from "@/lib/releases";

const META_ID = "default";
const BUILD_LOCK_TTL_MS = 45 * 60 * 1000;
const FULL_REBUILD_STALE_MS = 6 * 60 * 60 * 1000;
const FRESH_PAGE_SIZE = 200;
const CATALOG_PAGE_SIZE = 200;
const WRITE_CHUNK = 500;
/** Сколько карточек фазы releases подтягивать при head refresh (обычно хватает с запасом). */
const HEAD_FRESH_LIMIT = 500;

export type HomeFeedCacheStatus = "empty" | "building" | "ready" | "stale";

export type HomeFeedCacheMode = "full" | "head";

export type HomeFeedMetaDto = {
  status: HomeFeedCacheStatus;
  currentGeneration: number;
  itemCount: number;
  headUpdatedAt: string | null;
  fullBuiltAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

type FeedPage = {
  items: ReleaseItem[];
  hasMore: boolean;
  nextCursor: ReleasesCursor | null;
};

let rebuildInFlight: Promise<void> | null = null;

function asStatus(value: string): HomeFeedCacheStatus {
  if (value === "building" || value === "ready" || value === "stale" || value === "empty") {
    return value;
  }
  return "empty";
}

function payloadToItem(payload: Prisma.JsonValue): ReleaseItem {
  const dto = payload as ReleaseItemDto;
  return {
    ...dto,
    releasedAt: new Date(dto.releasedAt),
  };
}

function toCursor(phase: ReleasesCursor["phase"], item: ReleaseItem): ReleasesCursor {
  return {
    phase,
    releasedAt: item.releasedAt.toISOString(),
    id: item.id,
  };
}

function isCatalogHandoff(cursor?: ReleasesCursor | null): boolean {
  return Boolean(
    cursor &&
      cursor.phase === "catalog" &&
      (!cursor.releasedAt || !cursor.id),
  );
}

async function ensureMeta() {
  return prisma.homeFeedMeta.upsert({
    where: { id: META_ID },
    create: { id: META_ID, status: "empty" },
    update: {},
  });
}

export async function getHomeFeedMeta(): Promise<HomeFeedMetaDto> {
  const meta = await ensureMeta();
  return {
    status: asStatus(meta.status),
    currentGeneration: meta.currentGeneration,
    itemCount: meta.itemCount,
    headUpdatedAt: meta.headUpdatedAt?.toISOString() ?? null,
    fullBuiltAt: meta.fullBuiltAt?.toISOString() ?? null,
    lastError: meta.lastError,
    updatedAt: meta.updatedAt.toISOString(),
  };
}

async function tryAcquireBuildLock(): Promise<boolean> {
  const meta = await ensureMeta();
  const lockStale =
    meta.status !== "building" ||
    Date.now() - meta.updatedAt.getTime() > BUILD_LOCK_TTL_MS;

  if (!lockStale) return false;

  const updated = await prisma.$executeRaw`
    UPDATE "HomeFeedMeta"
    SET status = 'building',
        "lastError" = NULL,
        "updatedAt" = NOW()
    WHERE id = ${META_ID}
      AND (
        status <> 'building'
        OR "updatedAt" < NOW() - (${BUILD_LOCK_TTL_MS}::int * INTERVAL '1 millisecond')
      )
  `;

  return Number(updated) > 0;
}

async function releaseBuildLock(
  next: {
    status: HomeFeedCacheStatus;
    currentGeneration?: number;
    itemCount?: number;
    headUpdatedAt?: Date | null;
    fullBuiltAt?: Date | null;
    lastError?: string | null;
  },
) {
  await prisma.homeFeedMeta.update({
    where: { id: META_ID },
    data: {
      status: next.status,
      ...(next.currentGeneration !== undefined
        ? { currentGeneration: next.currentGeneration }
        : {}),
      ...(next.itemCount !== undefined ? { itemCount: next.itemCount } : {}),
      ...(next.headUpdatedAt !== undefined ? { headUpdatedAt: next.headUpdatedAt } : {}),
      ...(next.fullBuiltAt !== undefined ? { fullBuiltAt: next.fullBuiltAt } : {}),
      ...(next.lastError !== undefined ? { lastError: next.lastError } : {}),
    },
  });
}

async function fetchAllFreshReleases(limit = Number.POSITIVE_INFINITY): Promise<ReleaseItem[]> {
  const items: ReleaseItem[] = [];
  let after: { releasedAt: Date; id: string } | undefined;

  while (items.length < limit) {
    const pageLimit = Math.min(FRESH_PAGE_SIZE, limit - items.length);
    const rows = await queryFreshReleasesPerTitle(pageLimit, after);
    if (rows.length === 0) break;
    items.push(...rows);
    const last = rows.at(-1);
    if (!last || rows.length < pageLimit) break;
    after = { releasedAt: last.releasedAt, id: last.id };
  }

  return items;
}

async function fetchAllCatalogReleases(excludeIds: Set<string>): Promise<ReleaseItem[]> {
  const items: ReleaseItem[] = [];
  let after: { releasedAt: Date; id: string } | undefined;

  for (;;) {
    const rows = await queryCatalogReleasesPerTitle(CATALOG_PAGE_SIZE, after);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (excludeIds.has(row.id)) continue;
      items.push(row);
    }

    const last = rows.at(-1);
    if (!last || rows.length < CATALOG_PAGE_SIZE) break;
    after = { releasedAt: last.releasedAt, id: last.id };
  }

  return items;
}

async function writeGeneration(
  generation: number,
  rows: Array<{ item: ReleaseItem; phase: ReleasesCursor["phase"] }>,
) {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const chunk = rows.slice(i, i + WRITE_CHUNK).map((row, offset) => ({
      generation,
      rank: i + offset,
      titleId: row.item.id,
      phase: row.phase,
      releasedAt: row.item.releasedAt,
      payload: serializeRelease(row.item) as unknown as Prisma.InputJsonValue,
    }));
    await prisma.homeFeedItem.createMany({ data: chunk });
  }
}

async function deleteGeneration(generation: number) {
  await prisma.homeFeedItem.deleteMany({ where: { generation } });
}

/**
 * Полная пересборка: fresh + catalog → новое generation, атомарный flip.
 */
export async function rebuildHomeFeedCacheFull(): Promise<HomeFeedMetaDto> {
  const acquired = await tryAcquireBuildLock();
  if (!acquired) {
    return getHomeFeedMeta();
  }

  const meta = await ensureMeta();
  const nextGeneration = meta.currentGeneration + 1;

  try {
    const fresh = await fetchAllFreshReleases();
    const freshIds = new Set(fresh.map((item) => item.id));
    const catalog = await fetchAllCatalogReleases(freshIds);

    const rows: Array<{ item: ReleaseItem; phase: ReleasesCursor["phase"] }> = [
      ...fresh.map((item) => ({ item, phase: "releases" as const })),
      ...catalog.map((item) => ({ item, phase: "catalog" as const })),
    ];

    await deleteGeneration(nextGeneration);
    await writeGeneration(nextGeneration, rows);

    const now = new Date();
    await releaseBuildLock({
      status: "ready",
      currentGeneration: nextGeneration,
      itemCount: rows.length,
      headUpdatedAt: now,
      fullBuiltAt: now,
      lastError: null,
    });

    if (meta.currentGeneration !== nextGeneration) {
      await deleteGeneration(meta.currentGeneration);
    }

    return getHomeFeedMeta();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deleteGeneration(nextGeneration).catch(() => undefined);
    await releaseBuildLock({
      status: meta.itemCount > 0 ? "stale" : "empty",
      lastError: message,
    });
    throw error;
  }
}

/**
 * Обновить только голову (phase=releases), catalog-хвост текущего generation сохранить.
 */
export async function refreshHomeFeedHead(): Promise<HomeFeedMetaDto> {
  const preliminary = await ensureMeta();

  if (preliminary.itemCount === 0 || preliminary.currentGeneration <= 0) {
    scheduleHomeFeedRebuild("full");
    return getHomeFeedMeta();
  }

  const acquired = await tryAcquireBuildLock();
  if (!acquired) {
    return getHomeFeedMeta();
  }

  const meta = await ensureMeta();
  if (meta.itemCount === 0 || meta.currentGeneration <= 0) {
    await releaseBuildLock({
      status: "empty",
      lastError: null,
    });
    scheduleHomeFeedRebuild("full");
    return getHomeFeedMeta();
  }

  const generation = meta.currentGeneration;
  const nextGeneration = generation + 1;

  try {
    const fresh = await fetchAllFreshReleases(HEAD_FRESH_LIMIT);
    const freshIds = new Set(fresh.map((item) => item.id));

    const catalogRows = await prisma.homeFeedItem.findMany({
      where: {
        generation,
        phase: "catalog",
        titleId: { notIn: [...freshIds] },
      },
      orderBy: { rank: "asc" },
    });

    const rows: Array<{ item: ReleaseItem; phase: ReleasesCursor["phase"] }> = [
      ...fresh.map((item) => ({ item, phase: "releases" as const })),
      ...catalogRows.map((row) => ({
        item: payloadToItem(row.payload),
        phase: "catalog" as const,
      })),
    ];

    await deleteGeneration(nextGeneration);
    await writeGeneration(nextGeneration, rows);

    const now = new Date();
    await releaseBuildLock({
      status: meta.fullBuiltAt ? "ready" : "stale",
      currentGeneration: nextGeneration,
      itemCount: rows.length,
      headUpdatedAt: now,
      fullBuiltAt: meta.fullBuiltAt,
      lastError: null,
    });

    await deleteGeneration(generation);
    return getHomeFeedMeta();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deleteGeneration(nextGeneration).catch(() => undefined);
    await releaseBuildLock({
      status: meta.itemCount > 0 ? "stale" : "empty",
      lastError: message,
    });
    throw error;
  }
}

export async function rebuildHomeFeedCache(options: {
  mode: HomeFeedCacheMode;
}): Promise<HomeFeedMetaDto> {
  if (options.mode === "head") {
    return refreshHomeFeedHead();
  }
  return rebuildHomeFeedCacheFull();
}

export function scheduleHomeFeedRebuild(mode: HomeFeedCacheMode = "full"): void {
  if (rebuildInFlight) return;

  rebuildInFlight = (async () => {
    try {
      await rebuildHomeFeedCache({ mode });
    } catch (error) {
      console.error("[home-feed-cache] rebuild failed:", error);
    } finally {
      rebuildInFlight = null;
    }
  })();
}

/** После kodik sync: обновить голову; full — если кеш пуст/протух. */
export async function afterKodikSyncHomeFeedCache(opts: {
  newReleases: number;
  updatedMaterials: number;
}): Promise<void> {
  try {
    await refreshHomeFeedHead();
  } catch (error) {
    console.error("[home-feed-cache] head refresh after sync failed:", error);
  }

  const meta = await getHomeFeedMeta();
  const fullAgeMs = meta.fullBuiltAt
    ? Date.now() - new Date(meta.fullBuiltAt).getTime()
    : Number.POSITIVE_INFINITY;

  if (meta.status === "empty" || meta.itemCount === 0 || !meta.fullBuiltAt) {
    scheduleHomeFeedRebuild("full");
    return;
  }

  if (fullAgeMs >= FULL_REBUILD_STALE_MS) {
    scheduleHomeFeedRebuild("full");
    return;
  }

  if (opts.updatedMaterials > 0 || opts.newReleases > 0) {
    await prisma.homeFeedMeta.update({
      where: { id: META_ID },
      data: { status: "stale" },
    });
  }
}

/**
 * Страница из материализации. null — кеш ещё не готов (нужен fallback).
 */
export async function readHomeFeedPage(
  pageSize: number,
  cursor?: ReleasesCursor | null,
): Promise<FeedPage | null> {
  const meta = await ensureMeta();
  const status = asStatus(meta.status);

  if (meta.itemCount <= 0 || meta.currentGeneration <= 0) {
    if (status !== "building") {
      scheduleHomeFeedRebuild("full");
    }
    return null;
  }

  const generation = meta.currentGeneration;

  // Для cursor navigation достаточно найти стартовый rank одним запросом + slice.
  let startRank = 0;

  if (cursor && !isCatalogHandoff(cursor)) {
    const match =
      (await prisma.homeFeedItem.findFirst({
        where: {
          generation,
          titleId: cursor.id,
          phase: cursor.phase ?? "catalog",
        },
        select: { rank: true },
      })) ??
      (await prisma.homeFeedItem.findFirst({
        where: { generation, titleId: cursor.id },
        select: { rank: true },
      }));
    startRank = match ? match.rank + 1 : 0;
  } else if (isCatalogHandoff(cursor)) {
    const firstCatalog = await prisma.homeFeedItem.findFirst({
      where: { generation, phase: "catalog" },
      orderBy: { rank: "asc" },
      select: { rank: true },
    });
    startRank = firstCatalog?.rank ?? meta.itemCount;
  }

  const rows = await prisma.homeFeedItem.findMany({
    where: {
      generation,
      rank: { gte: startRank },
    },
    orderBy: { rank: "asc" },
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const items = pageRows.map((row) => payloadToItem(row.payload));
  const last = pageRows.at(-1);

  if (!last) {
    return { items: [], hasMore: false, nextCursor: null };
  }

  const lastPhase = last.phase === "releases" ? "releases" : "catalog";
  const lastItem = items.at(-1)!;

  // Если страница закончилась на releases, а дальше есть catalog — как в live SQL
  if (!hasMore && lastPhase === "releases") {
    const hasCatalog = await prisma.homeFeedItem.findFirst({
      where: { generation, phase: "catalog", rank: { gt: last.rank } },
      select: { rank: true },
    });
    if (hasCatalog) {
      return {
        items,
        hasMore: true,
        nextCursor: { phase: "catalog", releasedAt: "", id: "" },
      };
    }
  }

  // Переход releases→catalog внутри страницы: nextCursor по последнему элементу
  if (hasMore) {
    const nextRow = rows[pageSize];
    // Если следующий элемент — начало catalog после releases, клиент продолжает с catalog cursor
    if (lastPhase === "releases" && nextRow?.phase === "catalog") {
      return {
        items,
        hasMore: true,
        nextCursor: { phase: "catalog", releasedAt: "", id: "" },
      };
    }
    return {
      items,
      hasMore: true,
      nextCursor: toCursor(lastPhase, lastItem),
    };
  }

  return {
    items,
    hasMore: false,
    nextCursor: null,
  };
}

/** Live fallback: только phase=releases, без тяжёлого catalog. */
export async function readHomeFeedHeadLiveFallback(
  pageSize: number,
  cursor?: ReleasesCursor | null,
): Promise<FeedPage> {
  if (cursor && cursor.phase === "catalog") {
    return { items: [], hasMore: false, nextCursor: null };
  }

  const after =
    cursor?.releasedAt && cursor.id
      ? { releasedAt: new Date(cursor.releasedAt), id: cursor.id }
      : undefined;

  const rows = await queryFreshReleasesPerTitle(pageSize + 1, after);
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items.at(-1);

  if (hasMore && last) {
    return {
      items,
      hasMore: true,
      nextCursor: toCursor("releases", last),
    };
  }

  // Catalog ещё не в кеше — не запускаем тяжёлый SQL на request path
  return {
    items,
    hasMore: false,
    nextCursor: null,
  };
}
