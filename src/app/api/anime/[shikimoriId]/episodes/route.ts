import { NextRequest, NextResponse } from "next/server";
import { loadEpisodeSeasonStats, resolveEffectiveSeasonNumber } from "@/lib/episode-totals";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parseShikimoriId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  const kodikId = request.nextUrl.searchParams.get("kodikId")?.trim();
  if (!kodikId) {
    return NextResponse.json({ error: "Нужен kodikId" }, { status: 400 });
  }

  const seasonRaw = request.nextUrl.searchParams.get("season");
  const requestedSeason = seasonRaw != null ? Number(seasonRaw) : 1;
  if (!Number.isFinite(requestedSeason) || requestedSeason < 1) {
    return NextResponse.json({ error: "Некорректный сезон" }, { status: 400 });
  }

  const material = await prisma.kodikMaterial.findFirst({
    where: { kodikId, shikimoriId },
    select: { lastEpisode: true, episodesCount: true, lastSeason: true },
  });

  if (!material) {
    return NextResponse.json({ error: "Озвучка не найдена" }, { status: 404 });
  }

  const episodeStats = await loadEpisodeSeasonStats([kodikId]);
  const seasonNumber = resolveEffectiveSeasonNumber(
    requestedSeason,
    kodikId,
    material,
    episodeStats,
  );

  const dbEpisodes = await prisma.kodikEpisode.findMany({
    where: { materialId: kodikId, seasonNumber },
    orderBy: { episodeNumber: "asc" },
    select: { episodeNumber: true, seasonNumber: true },
  });

  if (dbEpisodes.length > 0) {
    return NextResponse.json({
      seasonNumber,
      episodes: dbEpisodes,
    });
  }

  const count =
    seasonNumber === (material.lastSeason ?? 1)
      ? (material.episodesCount ?? material.lastEpisode ?? 0)
      : 0;

  const episodes = Array.from({ length: Math.max(0, count) }, (_, index) => ({
    episodeNumber: index + 1,
    seasonNumber,
  }));

  return NextResponse.json({ seasonNumber, episodes });
}
