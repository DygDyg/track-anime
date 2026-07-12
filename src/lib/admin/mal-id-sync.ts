import { prisma } from "@/lib/prisma";
import { resolveMalIdsForShikimoriIds } from "@/lib/shikimori/mal-id";

type CountRow = { count: number | bigint };
type ShikimoriIdRow = { shikimoriId: number };

export type MalIdSyncStatusDto = {
  allTitles: number;
  playableTitles: number;
  mappedAllTitles: number;
  mappedPlayableTitles: number;
  cachedNullAllTitles: number;
  staleCachedTitles: number;
  coverageAllPct: number;
  coveragePlayablePct: number;
  updatedAt: string;
};

export type MalIdRefreshOptions = {
  limit?: number;
  force?: boolean;
};

export type MalIdRefreshResult = {
  candidates: number;
  fetched: number;
  withMalId: number;
  withoutMalId: number;
  status: MalIdSyncStatusDto;
};

function asNumber(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : 0;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

async function countSql(query: TemplateStringsArray): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>(query);
  return asNumber(rows[0]?.count);
}

export async function getMalIdSyncStatus(): Promise<MalIdSyncStatusDto> {
  const [
    allTitles,
    playableTitles,
    mappedAllTitles,
    mappedPlayableTitles,
    cachedNullAllTitles,
    staleCachedTitles,
  ] = await Promise.all([
    countSql`
      SELECT COUNT(DISTINCT "shikimoriId") AS count
      FROM "KodikMaterial"
      WHERE "shikimoriId" IS NOT NULL
    `,
    countSql`
      SELECT COUNT(DISTINCT "shikimoriId") AS count
      FROM "KodikMaterial"
      WHERE "shikimoriId" IS NOT NULL
        AND "playerLink" IS NOT NULL
        AND "translationType" <> 'shikimori-cache'
    `,
    countSql`
      SELECT COUNT(DISTINCT m."shikimoriId") AS count
      FROM "KodikMaterial" m
      INNER JOIN "AnimeExternalIdMap" e ON e."shikimoriId" = m."shikimoriId"
      WHERE m."shikimoriId" IS NOT NULL
        AND e."malId" IS NOT NULL
    `,
    countSql`
      SELECT COUNT(DISTINCT m."shikimoriId") AS count
      FROM "KodikMaterial" m
      INNER JOIN "AnimeExternalIdMap" e ON e."shikimoriId" = m."shikimoriId"
      WHERE m."shikimoriId" IS NOT NULL
        AND m."playerLink" IS NOT NULL
        AND m."translationType" <> 'shikimori-cache'
        AND e."malId" IS NOT NULL
    `,
    countSql`
      SELECT COUNT(DISTINCT m."shikimoriId") AS count
      FROM "KodikMaterial" m
      INNER JOIN "AnimeExternalIdMap" e ON e."shikimoriId" = m."shikimoriId"
      WHERE m."shikimoriId" IS NOT NULL
        AND e."malId" IS NULL
    `,
    countSql`
      SELECT COUNT(DISTINCT m."shikimoriId") AS count
      FROM "KodikMaterial" m
      INNER JOIN "AnimeExternalIdMap" e ON e."shikimoriId" = m."shikimoriId"
      WHERE m."shikimoriId" IS NOT NULL
        AND e."syncedAt" < NOW() - INTERVAL '30 days'
    `,
  ]);

  return {
    allTitles,
    playableTitles,
    mappedAllTitles,
    mappedPlayableTitles,
    cachedNullAllTitles,
    staleCachedTitles,
    coverageAllPct: pct(mappedAllTitles, allTitles),
    coveragePlayablePct: pct(mappedPlayableTitles, playableTitles),
    updatedAt: new Date().toISOString(),
  };
}

async function selectRefreshCandidates(options: MalIdRefreshOptions): Promise<number[]> {
  const limit = Number.isInteger(options.limit) && options.limit && options.limit > 0 ? options.limit : 500;

  const rows = options.force
    ? await prisma.$queryRaw<ShikimoriIdRow[]>`
        SELECT DISTINCT m."shikimoriId"
        FROM "KodikMaterial" m
        WHERE m."shikimoriId" IS NOT NULL
          AND m."playerLink" IS NOT NULL
          AND m."translationType" <> 'shikimori-cache'
        ORDER BY m."shikimoriId"
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<ShikimoriIdRow[]>`
        SELECT DISTINCT m."shikimoriId"
        FROM "KodikMaterial" m
        LEFT JOIN "AnimeExternalIdMap" e ON e."shikimoriId" = m."shikimoriId"
        WHERE m."shikimoriId" IS NOT NULL
          AND m."playerLink" IS NOT NULL
          AND m."translationType" <> 'shikimori-cache'
          AND (
            e."shikimoriId" IS NULL
            OR e."syncedAt" < NOW() - INTERVAL '30 days'
          )
        ORDER BY m."shikimoriId"
        LIMIT ${limit}
      `;

  return rows.map((row) => row.shikimoriId).filter((id) => Number.isInteger(id) && id > 0);
}

export async function refreshMalIdMappings(
  options: MalIdRefreshOptions = {},
): Promise<MalIdRefreshResult> {
  const candidates = await selectRefreshCandidates(options);

  if (candidates.length === 0) {
    return {
      candidates: 0,
      fetched: 0,
      withMalId: 0,
      withoutMalId: 0,
      status: await getMalIdSyncStatus(),
    };
  }

  const result = await resolveMalIdsForShikimoriIds(candidates, {
    forceRefresh: options.force,
  });
  const withMalId = [...result.resolved.values()].filter((malId) => malId != null).length;

  return {
    candidates: candidates.length,
    fetched: result.fetched,
    withMalId,
    withoutMalId: result.fetched - withMalId,
    status: await getMalIdSyncStatus(),
  };
}

export function scheduleMalIdRefreshForShikimoriIds(shikimoriIds: number[]): void {
  const unique = [...new Set(shikimoriIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return;

  void resolveMalIdsForShikimoriIds(unique).catch((error: unknown) => {
    console.error("[mal-id-sync] background refresh failed", error);
  });
}
