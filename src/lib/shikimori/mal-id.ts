import { prisma } from "@/lib/prisma";
import { shikimoriFetch } from "@/lib/shikimori/client";

const MAL_ID_SOURCE = "shikimori-graphql";
const MAL_ID_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_GRAPHQL_BATCH_SIZE = 50;

type ShikimoriGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ShikimoriAnimeMalIdNode = {
  id: string | number;
  malId: string | number | null;
};

type ShikimoriAnimeMalIdData = {
  animes: ShikimoriAnimeMalIdNode[];
};

export type ResolveMalIdsOptions = {
  forceRefresh?: boolean;
  maxAgeMs?: number;
};

export type ResolveMalIdsResult = {
  resolved: Map<number, number | null>;
  fetched: number;
};

const ANIME_MAL_ID_QUERY = `
  query TrackAnimeMalIds($ids: String!, $limit: Int!) {
    animes(ids: $ids, limit: $limit) {
      id
      malId
    }
  }
`;

function uniquePositiveIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

function isFresh(row: { syncedAt: Date }, maxAgeMs: number): boolean {
  return Date.now() - row.syncedAt.getTime() < maxAgeMs;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function fetchMalIdsFromShikimoriGraphql(
  shikimoriIds: readonly number[],
): Promise<Map<number, number | null>> {
  const ids = uniquePositiveIds(shikimoriIds);
  if (ids.length === 0) return new Map();

  const response = await shikimoriFetch<ShikimoriGraphqlResponse<ShikimoriAnimeMalIdData>>(
    "/graphql",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: ANIME_MAL_ID_QUERY,
        variables: {
          ids: ids.join(","),
          limit: ids.length,
        },
      }),
    },
  );

  if (!response) {
    throw new Error("Shikimori GraphQL endpoint returned 404");
  }

  if (response.errors?.length) {
    const message = response.errors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(`Shikimori GraphQL error: ${message || "unknown error"}`);
  }

  const byShikimoriId = new Map<number, number | null>();
  for (const node of response.data?.animes ?? []) {
    const shikimoriId = parsePositiveInt(node.id);
    if (!shikimoriId) continue;
    byShikimoriId.set(shikimoriId, parsePositiveInt(node.malId));
  }

  for (const id of ids) {
    if (!byShikimoriId.has(id)) byShikimoriId.set(id, null);
  }

  return byShikimoriId;
}

export async function resolveMalIdsForShikimoriIds(
  shikimoriIds: readonly number[],
  options: ResolveMalIdsOptions = {},
): Promise<ResolveMalIdsResult> {
  const ids = uniquePositiveIds(shikimoriIds);
  const maxAgeMs = options.maxAgeMs ?? MAL_ID_CACHE_TTL_MS;
  const resolved = new Map<number, number | null>();
  if (ids.length === 0) return { resolved, fetched: 0 };

  const cached = options.forceRefresh
    ? []
    : await prisma.animeExternalIdMap.findMany({
        where: { shikimoriId: { in: ids } },
        select: { shikimoriId: true, malId: true, syncedAt: true },
      });

  const cachedFreshIds = new Set<number>();
  for (const row of cached) {
    if (!isFresh(row, maxAgeMs)) continue;
    resolved.set(row.shikimoriId, row.malId);
    cachedFreshIds.add(row.shikimoriId);
  }

  const missingIds = ids.filter((id) => !cachedFreshIds.has(id));
  let fetched = 0;

  for (const batch of chunk(missingIds, MAX_GRAPHQL_BATCH_SIZE)) {
    const fetchedMap = await fetchMalIdsFromShikimoriGraphql(batch);
    const syncedAt = new Date();

    await prisma.$transaction(
      [...fetchedMap.entries()].map(([shikimoriId, malId]) =>
        prisma.animeExternalIdMap.upsert({
          where: { shikimoriId },
          create: {
            shikimoriId,
            malId,
            source: MAL_ID_SOURCE,
            syncedAt,
          },
          update: {
            malId,
            source: MAL_ID_SOURCE,
            syncedAt,
          },
        }),
      ),
    );

    for (const [shikimoriId, malId] of fetchedMap) {
      resolved.set(shikimoriId, malId);
    }
    fetched += fetchedMap.size;
  }

  return { resolved, fetched };
}

export async function resolveMalIdForShikimoriId(
  shikimoriId: number,
  options: ResolveMalIdsOptions = {},
): Promise<number | null> {
  const result = await resolveMalIdsForShikimoriIds([shikimoriId], options);
  return result.resolved.get(shikimoriId) ?? null;
}
