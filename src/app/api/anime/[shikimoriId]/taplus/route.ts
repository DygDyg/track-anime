import { NextRequest, NextResponse } from "next/server";
import type { KodikEpisodeValue } from "@/kodik/types";
import { kodikSearch } from "@/kodik/client";
import { fetchKodikFtorStreams } from "@/lib/kodik-ftor";
import { prisma } from "@/lib/prisma";
import {
  isSingleEpisodeKodikPlayerLink,
  toKodikPlayerEmbedUrl,
} from "@/lib/player-url";
import { buildTaPlusPreviewUrls } from "@/lib/ta-plus-previews";

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

function playerLinkFromKodikEpisodeValue(value: KodikEpisodeValue | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return normalizePlayerLink(value);
  return normalizePlayerLink(value.link);
}

/** Live Kodik `/seria/` for season+episode — avoids material `/serial/` (opens last_episode). */
async function resolveLiveSeriaPlayerLink(
  kodikId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<string | null> {
  try {
    const response = await kodikSearch({
      id: kodikId,
      with_episodes_data: true,
    });
    const season = response.results[0]?.seasons?.[String(seasonNumber)];
    const link = playerLinkFromKodikEpisodeValue(season?.episodes?.[String(episodeNumber)]);
    if (link && isSingleEpisodeKodikPlayerLink(link)) return link;
    return link;
  } catch {
    return null;
  }
}

async function resolveEpisodeContext(input: {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<{
  playerLink: string | null;
  episodeScreenshots: unknown;
  materialData: unknown;
}> {
  const material = await prisma.kodikMaterial.findFirst({
    where: { kodikId: input.kodikId, shikimoriId: input.shikimoriId },
    select: { playerLink: true, materialData: true },
  });
  if (!material) {
    return { playerLink: null, episodeScreenshots: null, materialData: null };
  }

  const episode = await prisma.kodikEpisode.findUnique({
    where: {
      materialId_seasonNumber_episodeNumber: {
        materialId: input.kodikId,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
      },
    },
    select: { playerLink: true, screenshots: true },
  });
  const fromEpisode = normalizePlayerLink(episode?.playerLink);
  if (fromEpisode && isSingleEpisodeKodikPlayerLink(fromEpisode)) {
    return {
      playerLink: fromEpisode,
      episodeScreenshots: episode?.screenshots ?? null,
      materialData: material.materialData,
    };
  }

  const liveSeria = await resolveLiveSeriaPlayerLink(
    input.kodikId,
    input.seasonNumber,
    input.episodeNumber,
  );
  if (liveSeria) {
    return {
      playerLink: liveSeria,
      episodeScreenshots: episode?.screenshots ?? null,
      materialData: material.materialData,
    };
  }

  if (fromEpisode) {
    return {
      playerLink: fromEpisode,
      episodeScreenshots: episode?.screenshots ?? null,
      materialData: material.materialData,
    };
  }

  const season = await prisma.kodikSeason.findUnique({
    where: {
      materialId_seasonNumber: {
        materialId: input.kodikId,
        seasonNumber: input.seasonNumber,
      },
    },
    select: { playerLink: true },
  });
  // Never fall back to material `/serial/` for a concrete episode — Kodik opens last_episode.
  return {
    playerLink: normalizePlayerLink(season?.playerLink),
    episodeScreenshots: episode?.screenshots ?? null,
    materialData: material.materialData,
  };
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
  let episodeScreenshots: unknown = null;
  let materialData: unknown = null;

  if (kodikId) {
    const ctx = await resolveEpisodeContext({
      shikimoriId,
      kodikId,
      seasonNumber,
      episodeNumber,
    });
    episodeScreenshots = ctx.episodeScreenshots;
    materialData = ctx.materialData;
    if (!playerLink) playerLink = ctx.playerLink;
  } else if (!playerLink) {
    return NextResponse.json({ error: "Нужен kodikId или url" }, { status: 400 });
  }

  if (!playerLink) {
    return NextResponse.json({ error: "Нет ссылки Kodik для этой серии" }, { status: 404 });
  }

  try {
    const streams = await fetchKodikFtorStreams(playerLink, request.signal);
    const qualities = Object.fromEntries(
      Object.entries(streams.qualities).sort((a, b) => Number(b[0]) - Number(a[0])),
    );
    const previews = buildTaPlusPreviewUrls({
      tiles: streams.tiles,
      qualities,
      episodeScreenshots,
      materialData,
    });
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
      previews,
      skips: streams.skips,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить поток";
    console.error("[taplus]", shikimoriId, kodikId, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
