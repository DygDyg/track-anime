import type { Prisma, PrismaClient } from "@prisma/client";

const STATUS_RANK: Record<string, number> = {
  anons: 1,
  ongoing: 2,
  released: 3,
};

const MAX_NUMBER_KEYS = [
  "episodes_total",
  "episodes_aired",
  "shikimori_episodes",
  "year",
] as const;

const LATEST_DATE_KEYS = [
  "next_episode_at",
  "released_at",
  "aired_at",
  "released_on",
  "aired_on",
] as const;

const NEWEST_STRING_KEYS = [
  "anime_title",
  "anime_title_en",
  "anime_title_jp",
  "anime_kind",
  "anime_description",
  "description",
  "anime_poster_url",
  "poster_url",
  "worldart_poster_url",
  "worldart_link",
  "shikimori_rating",
  "shikimori_score",
] as const;

const ARRAY_KEYS = [
  "anime_genres",
  "all_genres",
  "genres",
  "anime_studios",
  "studios",
] as const;

type MaterialRow = {
  kodikId: string;
  shikimoriId: number | null;
  kodikUpdatedAt: Date | null;
  updatedAt: Date;
  materialData: Prisma.JsonValue | null;
};

type ValueCandidate<T> = {
  value: T;
  updatedAt: number;
};

export type NormalizeKodikMaterialMetadataOptions = {
  ids?: number[] | null;
  limit?: number | null;
  dryRun?: boolean;
  quiet?: boolean;
};

export type NormalizeKodikMaterialMetadataResult = {
  touchedTitles: number;
  touchedRows: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function candidateUpdatedAt(row: MaterialRow): number {
  const data = asRecord(row.materialData);
  const syncedAt = readDateMs(data.anime_full_synced_at) ?? readDateMs(data.synced_at);
  return syncedAt ?? row.kodikUpdatedAt?.getTime() ?? row.updatedAt.getTime();
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function newer<T>(left: ValueCandidate<T> | null, right: ValueCandidate<T>): ValueCandidate<T> {
  return !left || right.updatedAt >= left.updatedAt ? right : left;
}

function statusRank(status: string): number {
  return STATUS_RANK[status.toLowerCase()] ?? 0;
}

function betterStatus(left: ValueCandidate<string> | null, right: ValueCandidate<string>): ValueCandidate<string> {
  if (!left) return right;
  const leftRank = statusRank(left.value);
  const rightRank = statusRank(right.value);
  if (rightRank !== leftRank) return rightRank > leftRank ? right : left;
  return newer(left, right);
}

function collectAnimeFull(data: Record<string, unknown>, updatedAt: number): ValueCandidate<Record<string, unknown>> | null {
  const animeFull = asRecord(data.anime_full);
  if (Object.keys(animeFull).length === 0) return null;
  const animeUpdatedAt = readDateMs(data.anime_full_synced_at) ?? updatedAt;
  return { value: animeFull, updatedAt: animeUpdatedAt };
}

function mergeStringArrays(values: unknown[]): string[] | null {
  const seen = new Map<string, string>();
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== "string") continue;
      const normalized = item.trim();
      if (!normalized) continue;
      const key = normalized.toLocaleLowerCase("ru-RU");
      if (!seen.has(key)) seen.set(key, normalized);
    }
  }
  return seen.size > 0 ? [...seen.values()] : null;
}

function buildCanonicalPatch(rows: MaterialRow[]): Record<string, unknown> {
  const maxNumbers = new Map<string, number>();
  const latestDates = new Map<string, ValueCandidate<string>>();
  const newestStrings = new Map<string, ValueCandidate<string>>();
  const arrayValues = new Map<string, unknown[]>();
  let bestStatus: ValueCandidate<string> | null = null;
  let bestAnimeFull: ValueCandidate<Record<string, unknown>> | null = null;

  for (const row of rows) {
    const data = asRecord(row.materialData);
    const updatedAt = candidateUpdatedAt(row);
    const animeFull = collectAnimeFull(data, updatedAt);
    if (animeFull) bestAnimeFull = newer(bestAnimeFull, animeFull);

    for (const key of ["anime_status", "all_status"] as const) {
      const status = readString(data[key]) ?? readString(animeFull?.value.status);
      if (status) bestStatus = betterStatus(bestStatus, { value: status, updatedAt });
    }

    for (const key of MAX_NUMBER_KEYS) {
      const value = readNumber(data[key]);
      if (value == null || value <= 0) continue;
      const prev = maxNumbers.get(key);
      if (prev == null || value > prev) maxNumbers.set(key, value);
    }

    const episodes = readNumber(animeFull?.value.episodes);
    if (episodes != null && episodes > 0) {
      for (const key of ["episodes_total", "shikimori_episodes"] as const) {
        const prev = maxNumbers.get(key);
        if (prev == null || episodes > prev) maxNumbers.set(key, episodes);
      }
    }

    const aired = readNumber(animeFull?.value.episodes_aired);
    if (aired != null && aired > 0) {
      const prev = maxNumbers.get("episodes_aired");
      if (prev == null || aired > prev) maxNumbers.set("episodes_aired", aired);
    }

    for (const key of LATEST_DATE_KEYS) {
      const value = readString(data[key]) ?? readString(animeFull?.value[key]);
      if (!value || readDateMs(value) == null) continue;
      latestDates.set(key, newer(latestDates.get(key) ?? null, { value, updatedAt }));
    }

    for (const key of NEWEST_STRING_KEYS) {
      const value = readString(data[key]);
      if (!value) continue;
      newestStrings.set(key, newer(newestStrings.get(key) ?? null, { value, updatedAt }));
    }

    for (const key of ARRAY_KEYS) {
      const list = arrayValues.get(key) ?? [];
      list.push(data[key]);
      arrayValues.set(key, list);
    }
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of maxNumbers) patch[key] = value;
  for (const [key, candidate] of latestDates) patch[key] = candidate.value;
  for (const [key, candidate] of newestStrings) patch[key] = candidate.value;

  if (bestStatus) {
    patch.anime_status = bestStatus.value;
    patch.all_status = bestStatus.value;
  }

  if (bestAnimeFull) {
    patch.anime_full = bestAnimeFull.value;
    patch.anime_full_synced_at = new Date(bestAnimeFull.updatedAt).toISOString();
  }

  for (const [key, values] of arrayValues) {
    const merged = mergeStringArrays(values);
    if (merged) patch[key] = merged;
  }

  return patch;
}

function hasDifferentPatch(data: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).some(([key, value]) => JSON.stringify(data[key]) !== JSON.stringify(value));
}

export async function normalizeKodikMaterialMetadata(
  prisma: PrismaClient,
  options: NormalizeKodikMaterialMetadataOptions = {},
): Promise<NormalizeKodikMaterialMetadataResult> {
  const dryRun = options.dryRun ?? false;
  const groups = await prisma.kodikMaterial.groupBy({
    by: ["shikimoriId"],
    where: {
      shikimoriId: options.ids?.length ? { in: options.ids } : { not: null },
    },
    _count: { _all: true },
    orderBy: { shikimoriId: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  let touchedTitles = 0;
  let touchedRows = 0;

  for (const group of groups) {
    if (group.shikimoriId == null || group._count._all < 2) continue;

    const rows = await prisma.kodikMaterial.findMany({
      where: { shikimoriId: group.shikimoriId },
      select: {
        kodikId: true,
        shikimoriId: true,
        kodikUpdatedAt: true,
        updatedAt: true,
        materialData: true,
      },
      orderBy: [{ kodikUpdatedAt: "desc" }, { updatedAt: "desc" }],
    });

    const patch = buildCanonicalPatch(rows);
    const updates = rows
      .map((row) => {
        const data = asRecord(row.materialData);
        if (!hasDifferentPatch(data, patch)) return null;
        return {
          kodikId: row.kodikId,
          materialData: { ...data, ...patch } as Prisma.InputJsonValue,
        };
      })
      .filter((update): update is { kodikId: string; materialData: Prisma.InputJsonValue } => Boolean(update));

    if (updates.length === 0) continue;

    touchedTitles += 1;
    touchedRows += updates.length;
    if (!options.quiet) {
      console.log(
        `${dryRun ? "would update" : "update"} shikimoriId=${group.shikimoriId} rows=${updates.length}`,
        {
          anime_status: patch.anime_status,
          episodes_total: patch.episodes_total,
          episodes_aired: patch.episodes_aired,
          shikimori_episodes: patch.shikimori_episodes,
        },
      );
    }

    if (!dryRun) {
      await prisma.$transaction(
        updates.map((update) =>
          prisma.kodikMaterial.update({
            where: { kodikId: update.kodikId },
            data: { materialData: update.materialData },
          }),
        ),
      );
    }
  }

  return { touchedTitles, touchedRows };
}
