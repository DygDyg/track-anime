import type { Prisma, PrismaClient } from "@prisma/client";
import type { KodikEpisodeValue, KodikMaterial, KodikSeason } from "../kodik/types.js";
import {
  getWorldArtLink,
  mergeMaterialPosterFields,
  resolveMaterialPosterUrl,
  type MaterialPosterSource,
} from "@/lib/material-poster";
import { fetchWorldArtPoster } from "@/lib/world-art-poster";
import { dispatchHistoryNewEpisodeRelease } from "@/lib/notifications/dispatcher";

function parseShikimoriId(value?: string | number | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function posterFromMaterial(material: KodikMaterial): string | null {
  return resolveMaterialPosterUrl(buildMaterialPosterSource(material));
}

function buildMaterialPosterSource(material: KodikMaterial): MaterialPosterSource {
  return mergeMaterialPosterFields(material.material_data, {
    worldart_link: material.worldart_link ?? null,
    worldart_animation_id: material.worldart_animation_id ?? null,
    worldart_cinema_id: material.worldart_cinema_id ?? null,
  });
}

async function buildStoredMaterialData(
  material: KodikMaterial,
): Promise<Prisma.InputJsonValue | undefined> {
  let merged = buildMaterialPosterSource(material);
  if (!resolveMaterialPosterUrl(merged)) {
    const worldArtLink = getWorldArtLink(merged);
    if (worldArtLink) {
      const poster = await fetchWorldArtPoster(worldArtLink);
      if (poster) {
        merged = { ...merged, worldart_poster_url: poster };
      }
    }
  }

  return Object.keys(merged).length > 0 ? (merged as Prisma.InputJsonValue) : undefined;
}

function kodikReleaseDate(material: KodikMaterial): Date {
  if (material.updated_at) {
    const parsed = new Date(material.updated_at);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export type SaveMaterialResult = {
  materialId: string;
  newEpisodes: number;
  newReleases: number;
};

export async function saveKodikMaterial(
  prisma: PrismaClient,
  material: KodikMaterial,
  options: { loadEpisodes: boolean; trackReleases: boolean },
): Promise<SaveMaterialResult> {
  const translation = material.translation;
  if (!translation) {
    throw new Error(`Материал ${material.id} без translation`);
  }

  const shikimoriId = parseShikimoriId(material.shikimori_id);
  const previous = await prisma.kodikMaterial.findUnique({
    where: { kodikId: material.id },
    select: { lastSeason: true, lastEpisode: true },
  });

  const materialData = await buildStoredMaterialData(material);

  const materialRow = await prisma.kodikMaterial.upsert({
    where: { kodikId: material.id },
    create: {
      kodikId: material.id,
      shikimoriId,
      type: material.type,
      title: material.title,
      titleOrig: material.title_orig ?? null,
      otherTitle: material.other_title ?? null,
      year: material.year ?? null,
      quality: material.quality ?? null,
      playerLink: material.link ?? null,
      lastSeason: material.last_season ?? null,
      lastEpisode: material.last_episode ?? null,
      episodesCount: material.episodes_count ?? null,
      translationId: translation.id,
      translationTitle: translation.title,
      translationType: translation.type,
      kodikCreatedAt: material.created_at ? new Date(material.created_at) : null,
      kodikUpdatedAt: material.updated_at ? new Date(material.updated_at) : null,
      episodesLoaded: options.loadEpisodes && Boolean(material.seasons),
      materialData,
    },
    update: {
      shikimoriId,
      type: material.type,
      title: material.title,
      titleOrig: material.title_orig ?? null,
      otherTitle: material.other_title ?? null,
      year: material.year ?? null,
      quality: material.quality ?? null,
      playerLink: material.link ?? null,
      lastSeason: material.last_season ?? null,
      lastEpisode: material.last_episode ?? null,
      episodesCount: material.episodes_count ?? null,
      translationId: translation.id,
      translationTitle: translation.title,
      translationType: translation.type,
      kodikUpdatedAt: material.updated_at ? new Date(material.updated_at) : null,
      episodesLoaded: options.loadEpisodes && Boolean(material.seasons) ? true : undefined,
      materialData,
    },
  });

  let newEpisodes = 0;
  let newReleases = 0;

  if (options.loadEpisodes && material.seasons) {
    const counts = await saveSeasonsAndEpisodes(prisma, material.id, material.seasons);
    newEpisodes = counts.newEpisodes;

    if (options.trackReleases) {
      newReleases = await trackLatestRelease(
        prisma,
        materialRow,
        material,
        previous?.lastSeason ?? null,
        previous?.lastEpisode ?? null,
      );
    }
  } else if (options.trackReleases) {
    newReleases = await trackLatestRelease(
      prisma,
      materialRow,
      material,
      previous?.lastSeason ?? null,
      previous?.lastEpisode ?? null,
    );
  }

  return { materialId: material.id, newEpisodes, newReleases };
}

async function saveSeasonsAndEpisodes(
  prisma: PrismaClient,
  materialId: string,
  seasons: Record<string, KodikSeason>,
): Promise<{ newEpisodes: number }> {
  let newEpisodes = 0;

  for (const [seasonKey, seasonData] of Object.entries(seasons)) {
    const seasonNumber = Number(seasonKey);
    if (!Number.isFinite(seasonNumber)) continue;

    const season = await prisma.kodikSeason.upsert({
      where: {
        materialId_seasonNumber: { materialId, seasonNumber },
      },
      create: {
        materialId,
        seasonNumber,
        playerLink: seasonData.link ?? null,
      },
      update: {
        playerLink: seasonData.link ?? null,
      },
    });

    if (!seasonData.episodes) continue;

    for (const [episodeKey, episodeValue] of Object.entries(seasonData.episodes)) {
      const episodeNumber = Number(episodeKey);
      if (!Number.isFinite(episodeNumber)) continue;

      const parsed = parseEpisodeValue(episodeValue);
      if (!parsed) continue;

      const episodeWhere = {
        materialId_seasonNumber_episodeNumber: {
          materialId,
          seasonNumber,
          episodeNumber,
        },
      };
      const existingEpisode = await prisma.kodikEpisode.findUnique({
        where: episodeWhere,
        select: { id: true },
      });

      if (existingEpisode) {
        await prisma.kodikEpisode.update({
          where: episodeWhere,
          data: {
            playerLink: parsed.playerLink,
            title: parsed.title,
            screenshots: parsed.screenshots,
          },
        });
      } else {
        await prisma.kodikEpisode.create({
          data: {
            materialId,
            seasonId: season.id,
            seasonNumber,
            episodeNumber,
            playerLink: parsed.playerLink,
            title: parsed.title,
            screenshots: parsed.screenshots,
          },
        });
        newEpisodes += 1;
      }
    }
  }

  return { newEpisodes };
}

function parseEpisodeValue(value: KodikEpisodeValue): {
  playerLink: string;
  title: string | null;
  screenshots: Prisma.InputJsonValue | undefined;
} | null {
  if (typeof value === "string") {
    return { playerLink: value, title: null, screenshots: undefined };
  }

  if (value?.link) {
    return {
      playerLink: value.link,
      title: value.title ?? null,
      screenshots: value.screenshots as Prisma.InputJsonValue | undefined,
    };
  }

  return null;
}

async function trackLatestRelease(
  prisma: PrismaClient,
  materialRow: { kodikId: string; translationId: number; translationTitle: string; title: string },
  material: KodikMaterial,
  prevSeason: number | null,
  prevEpisode: number | null,
): Promise<number> {
  const season = material.last_season ?? 1;
  const episode = material.last_episode;
  if (!episode) return 0;

  const isNew =
    prevSeason === null ||
    prevEpisode === null ||
    season > prevSeason ||
    (season === prevSeason && episode > prevEpisode);

  if (!isNew) return 0;

  let playerLink = material.link ?? null;
  const seasonData = material.seasons?.[String(season)];
  const episodeData = seasonData?.episodes?.[String(episode)];
  if (episodeData) {
    const parsed = parseEpisodeValue(episodeData);
    if (parsed) playerLink = parsed.playerLink;
  }

  try {
    await prisma.kodikEpisodeRelease.create({
      data: {
        shikimoriId: parseShikimoriId(material.shikimori_id),
        materialId: materialRow.kodikId,
        seasonNumber: season,
        episodeNumber: episode,
        translationId: materialRow.translationId,
        translationName: materialRow.translationTitle,
        animeTitle: material.material_data?.anime_title ?? material.title,
        posterUrl: posterFromMaterial(material),
        playerLink,
        releasedAt: kodikReleaseDate(material),
      },
    });

    void dispatchHistoryNewEpisodeRelease({
      materialId: materialRow.kodikId,
      seasonNumber: season,
      episodeNumber: episode,
    }).catch((error: unknown) => {
      console.error("[notifications] dispatch failed", error);
    });

    return 1;
  } catch (error) {
    if (isUniqueViolation(error)) {
      await prisma.kodikEpisodeRelease.update({
        where: {
          materialId_seasonNumber_episodeNumber: {
            materialId: materialRow.kodikId,
            seasonNumber: season,
            episodeNumber: episode,
          },
        },
        data: {
          animeTitle: material.material_data?.anime_title ?? material.title,
          posterUrl: posterFromMaterial(material),
          playerLink,
          releasedAt: kodikReleaseDate(material),
        },
      });
      return 0;
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
