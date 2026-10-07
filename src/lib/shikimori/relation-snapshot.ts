import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const RELATION_SNAPSHOT_KIND = {
  related: "related",
  franchise: "franchise",
  similar: "similar",
} as const;

export type RelationSnapshotKind =
  (typeof RELATION_SNAPSHOT_KIND)[keyof typeof RELATION_SNAPSHOT_KIND];

/** related / franchise — редко меняются */
export const RELATED_FRANCHISE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** similar — тот же горизонт (~месяц), реже бьём Shikimori */
export const SIMILAR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RelationSnapshotRow = {
  payload: unknown;
  syncedAt: Date;
  fresh: boolean;
};

function ttlForKind(kind: RelationSnapshotKind): number {
  return kind === RELATION_SNAPSHOT_KIND.similar ? SIMILAR_TTL_MS : RELATED_FRANCHISE_TTL_MS;
}

export function isRelationSnapshotFresh(kind: RelationSnapshotKind, syncedAt: Date): boolean {
  return Date.now() - syncedAt.getTime() < ttlForKind(kind);
}

export async function loadRelationSnapshot(
  shikimoriId: number,
  kind: RelationSnapshotKind,
): Promise<RelationSnapshotRow | null> {
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) return null;

  const row = await prisma.animeRelationSnapshot.findUnique({
    where: {
      shikimoriId_kind: { shikimoriId, kind },
    },
    select: { payload: true, syncedAt: true },
  });

  if (!row) return null;

  return {
    payload: row.payload,
    syncedAt: row.syncedAt,
    fresh: isRelationSnapshotFresh(kind, row.syncedAt),
  };
}

export async function persistRelationSnapshot(
  shikimoriId: number,
  kind: RelationSnapshotKind,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) return;

  const syncedAt = new Date();
  await prisma.animeRelationSnapshot.upsert({
    where: {
      shikimoriId_kind: { shikimoriId, kind },
    },
    create: {
      shikimoriId,
      kind,
      payload,
      syncedAt,
    },
    update: {
      payload,
      syncedAt,
    },
  });
}

/**
 * Помечает снимки протухшими (payload остаётся для stale fallback).
 * Следующий визит страницы перезапросит Shikimori.
 */
export async function invalidateRelationSnapshots(shikimoriId: number): Promise<void> {
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) return;

  await prisma.animeRelationSnapshot.updateMany({
    where: { shikimoriId },
    data: { syncedAt: new Date(0) },
  });
}

export function normalizeAnimeStatus(status: string | null | undefined): string | null {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** true, если оба статуса заданы и различаются (например ongoing → released). */
export function didAnimeStatusChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  const from = normalizeAnimeStatus(previous);
  const to = normalizeAnimeStatus(next);
  if (!from || !to) return false;
  return from !== to;
}
