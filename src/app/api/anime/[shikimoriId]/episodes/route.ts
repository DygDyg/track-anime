import { NextRequest, NextResponse } from "next/server";
import type { KodikEpisodeValue, KodikSeason } from "@/kodik/types";
import { kodikSearch } from "@/kodik/client";
import { loadEpisodeSeasonStats, resolveEffectiveSeasonNumber } from "@/lib/episode-totals";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

type SeasonItemDto = {
  seasonNumber: number;
  title: string | null;
};

function parseShikimoriId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parseKodikEpisode(value: KodikEpisodeValue): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value?.link);
}

function mapLiveSeasonEpisodes(
  seasonNumber: number,
  season: KodikSeason | undefined,
): Array<{ episodeNumber: number; seasonNumber: number }> {
  if (!season?.episodes) return [];

  return Object.entries(season.episodes)
    .map(([episodeKey, episodeValue]) => ({
      episodeNumber: Number(episodeKey),
      valid: parseKodikEpisode(episodeValue),
    }))
    .filter((episode) => Number.isInteger(episode.episodeNumber) && episode.episodeNumber > 0 && episode.valid)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map((episode) => ({ episodeNumber: episode.episodeNumber, seasonNumber }));
}

async function loadLiveKodikSeasons(
  kodikId: string,
): Promise<Record<string, KodikSeason> | null> {
  try {
    const response = await kodikSearch({
      id: kodikId,
      with_episodes_data: true,
    });

    return response.results[0]?.seasons ?? null;
  } catch {
    return null;
  }
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
  if (!Number.isInteger(requestedSeason) || requestedSeason < 0) {
    return NextResponse.json({ error: "Некорректный сезон" }, { status: 400 });
  }
  const exactSeason = request.nextUrl.searchParams.get("exactSeason") === "1";

  const material = await prisma.kodikMaterial.findFirst({
    where: { kodikId, shikimoriId },
    select: { lastEpisode: true, episodesCount: true, lastSeason: true },
  });

  if (!material) {
    return NextResponse.json({ error: "Озвучка не найдена" }, { status: 404 });
  }

  const episodeStats = await loadEpisodeSeasonStats([kodikId]);
  const [dbSeasons, dbEpisodeSeasons] = await Promise.all([
    prisma.kodikSeason.findMany({
      where: { materialId: kodikId },
      orderBy: { seasonNumber: "asc" },
      select: { seasonNumber: true },
    }),
    prisma.kodikEpisode.groupBy({
      by: ["seasonNumber"],
      where: { materialId: kodikId },
      _max: { episodeNumber: true },
      orderBy: { seasonNumber: "asc" },
    }),
  ]);
  const seasonNumbers = new Set<number>();
  const addSeason = (seasonNumber: number) => {
    if (seasonNumber < 0) return;
    seasonNumbers.add(seasonNumber);
  };
  for (const season of dbSeasons) {
    addSeason(season.seasonNumber);
  }
  for (const season of dbEpisodeSeasons) {
    if ((season._max.episodeNumber ?? 0) > 0 && season.seasonNumber >= 0) {
      addSeason(season.seasonNumber);
    }
  }

  const liveSeasons = seasonNumbers.size <= 1 || seasonNumbers.has(0)
    ? await loadLiveKodikSeasons(kodikId)
    : null;
  if (liveSeasons) {
    for (const [seasonKey, season] of Object.entries(liveSeasons)) {
      const liveSeasonNumber = Number(seasonKey);
      if (!Number.isInteger(liveSeasonNumber) || liveSeasonNumber < 0) continue;
      if (mapLiveSeasonEpisodes(liveSeasonNumber, season).length > 0) {
        addSeason(liveSeasonNumber);
      }
    }
  }

  if (seasonNumbers.size === 0) {
    seasonNumbers.add(material.lastSeason ?? 1);
  }
  const seasonNumber =
    (exactSeason || requestedSeason !== 1) && seasonNumbers.has(requestedSeason)
      ? requestedSeason
      : resolveEffectiveSeasonNumber(requestedSeason, kodikId, material, episodeStats);
  const seasons: SeasonItemDto[] = [...seasonNumbers]
    .sort((a, b) => a - b)
    .map((value) => ({
      seasonNumber: value,
      title: liveSeasons?.[String(value)]?.title?.trim() || null,
    }));

  const dbEpisodes = await prisma.kodikEpisode.findMany({
    where: { materialId: kodikId, seasonNumber },
    orderBy: { episodeNumber: "asc" },
    select: { episodeNumber: true, seasonNumber: true },
  });

  if (dbEpisodes.length > 0) {
    return NextResponse.json({
      seasonNumber,
      seasons,
      episodes: dbEpisodes,
    });
  }

  const liveEpisodes = liveSeasons
    ? mapLiveSeasonEpisodes(seasonNumber, liveSeasons[String(seasonNumber)])
    : [];
  if (liveEpisodes.length > 0) {
    return NextResponse.json({ seasonNumber, seasons, episodes: liveEpisodes });
  }

  const count = seasonNumber === (material.lastSeason ?? 1)
    ? (material.episodesCount ?? material.lastEpisode ?? 0)
    : 0;

  const episodes = Array.from({ length: Math.max(0, count) }, (_, index) => ({
    episodeNumber: index + 1,
    seasonNumber,
  }));

  return NextResponse.json({ seasonNumber, seasons, episodes });
}
