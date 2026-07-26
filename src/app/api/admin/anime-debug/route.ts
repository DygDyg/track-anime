import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const url = new URL(request.url);
  const shikimoriId = parsePositiveInt(url.searchParams.get("shikimoriId"));
  const materialId = url.searchParams.get("materialId")?.trim() || null;
  if (!shikimoriId && !materialId) {
    return NextResponse.json({ error: "Нужен shikimoriId или materialId" }, { status: 400 });
  }

  const materialWhere = materialId
    ? { OR: [{ kodikId: materialId }, ...(shikimoriId ? [{ shikimoriId }] : [])] }
    : { shikimoriId: shikimoriId! };

  const materials = await prisma.kodikMaterial.findMany({
    where: materialWhere,
    include: {
      seasons: { orderBy: { seasonNumber: "asc" }, include: { episodes: { orderBy: { episodeNumber: "asc" } } } },
      episodes: { orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] },
      releases: { orderBy: { releasedAt: "desc" } },
    },
    orderBy: { kodikUpdatedAt: "desc" },
  });

  const resolvedShikimoriId = shikimoriId ?? materials.find((item) => item.shikimoriId != null)?.shikimoriId ?? null;
  const materialIds = materials.map((item) => item.kodikId);
  const [externalIds, skipTimes, releases] = await Promise.all([
    resolvedShikimoriId
      ? prisma.animeExternalIdMap.findUnique({ where: { shikimoriId: resolvedShikimoriId } })
      : null,
    resolvedShikimoriId
      ? prisma.animeEpisodeSkipTime.findMany({
          where: { shikimoriId: resolvedShikimoriId },
          orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }, { startTime: "asc" }],
        })
      : [],
    prisma.kodikEpisodeRelease.findMany({
      where: materialIds.length > 0 ? { materialId: { in: materialIds } } : { id: "__none__" },
      orderBy: { releasedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    query: {
      shikimoriId: resolvedShikimoriId,
      materialId,
      seasonNumber: parsePositiveInt(url.searchParams.get("seasonNumber")),
      episodeNumber: parsePositiveInt(url.searchParams.get("episodeNumber")),
    },
    sources: {
      kodikMaterials: materials,
      kodikEpisodeReleases: releases,
      animeExternalIdMap: externalIds,
      aniSkipTimes: skipTimes,
    },
  });
}
