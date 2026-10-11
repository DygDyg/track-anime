import { NextRequest, NextResponse } from "next/server";
import { fetchKodikFtorStreams } from "@/lib/kodik-ftor";
import { prisma } from "@/lib/prisma";
import { toKodikPlayerEmbedUrl } from "@/lib/player-url";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizePlayerLink(link: string | null | undefined): string | null {
  if (!link?.trim()) return null;
  return toKodikPlayerEmbedUrl(link.trim());
}

async function resolveEpisodePlayerLink(input: {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<string | null> {
  const material = await prisma.kodikMaterial.findFirst({
    where: { kodikId: input.kodikId, shikimoriId: input.shikimoriId },
    select: { playerLink: true },
  });
  if (!material) return null;

  const episode = await prisma.kodikEpisode.findUnique({
    where: {
      materialId_seasonNumber_episodeNumber: {
        materialId: input.kodikId,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
      },
    },
    select: { playerLink: true },
  });
  const fromEpisode = normalizePlayerLink(episode?.playerLink);
  if (fromEpisode) return fromEpisode;

  const season = await prisma.kodikSeason.findUnique({
    where: {
      materialId_seasonNumber: {
        materialId: input.kodikId,
        seasonNumber: input.seasonNumber,
      },
    },
    select: { playerLink: true },
  });
  return normalizePlayerLink(season?.playerLink) ?? normalizePlayerLink(material.playerLink);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parsePositiveInt(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  const urlParam = request.nextUrl.searchParams.get("url")?.trim() || null;
  const kodikId = request.nextUrl.searchParams.get("kodikId")?.trim() || null;
  const seasonNumber = parseNonNegativeInt(request.nextUrl.searchParams.get("season")) ?? 1;
  const episodeNumber = parsePositiveInt(request.nextUrl.searchParams.get("episode")) ?? 1;

  let playerLink = urlParam ? normalizePlayerLink(urlParam) : null;
  if (!playerLink) {
    if (!kodikId) {
      return NextResponse.json({ error: "Нужен kodikId или url" }, { status: 400 });
    }
    playerLink = await resolveEpisodePlayerLink({
      shikimoriId,
      kodikId,
      seasonNumber,
      episodeNumber,
    });
  }

  if (!playerLink) {
    return NextResponse.json({ error: "Нет ссылки Kodik для этой серии" }, { status: 404 });
  }

  try {
    const streams = await fetchKodikFtorStreams(playerLink, request.signal);
    const qualities = Object.fromEntries(
      Object.entries(streams.qualities).sort((a, b) => Number(b[0]) - Number(a[0])),
    );
    return NextResponse.json({
      ok: true,
      shikimoriId,
      kodikId,
      seasonNumber,
      episodeNumber,
      playerLink,
      domain: streams.domain,
      default: streams.defaultQuality,
      qualities,
      tiles: streams.tiles,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить поток";
    console.error("[taplus]", shikimoriId, kodikId, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
