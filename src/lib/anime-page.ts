import { isShikimoriStubMaterial } from "@/db/save-shikimori-material";
import { cache } from "react";
import { resolveAnnouncedEpisodesTotalForShikimoriMaterials } from "@/lib/episode-totals";
import { prisma } from "@/lib/prisma";
import { extractKodikMaterialMeta } from "@/lib/kodik-material-meta";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { parseScreenshotUrls, uniqueScreenshotUrls } from "@/lib/screenshots";
import { discoverPosterUrl, posterFromShikimoriAnime } from "@/lib/poster-fallback";
import {
  getShikimoriAnime,
  getShikimoriAnimeCachedOnly,
  scheduleShikimoriAnimeRefresh,
} from "@/lib/shikimori/animes";
import {
  loadStaleShikimoriAnimeFromCache,
  parseShikimoriAnimeFromMaterialData,
} from "@/lib/shikimori/anime-cache";
import { isShikimoriMissingImage, shikimoriAssetUrl } from "@/lib/shikimori/client";
import { getShikimoriEndpoints, shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import { pickYoutubeTrailerId } from "@/lib/shikimori/trailer";
import type { ShikimoriAnime, ShikimoriStudio } from "@/lib/shikimori/types";

export type KodikTranslationDto = {
  kodikId: string;
  translationId: number;
  translationTitle: string;
  translationType: string;
  lastSeason: number | null;
  lastEpisode: number | null;
  availableSeasons: Array<{ seasonNumber: number }>;
  playerLink: string | null;
  quality: string | null;
};

export type AnimePageDto = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  posterUrl: string | null;
  score: string | null;
  status: string | null;
  kind: string | null;
  rating: string | null;
  episodes: number | null;
  episodesAired: number | null;
  duration: number | null;
  airedOn: string | null;
  releasedOn: string | null;
  description: string | null;
  genres: { id: number; name: string }[];
  studios: { id: number; name: string; imageUrl: string | null }[];
  synonyms: string[];
  shikimoriUrl: string | null;
  screenshots: string[];
  translations: KodikTranslationDto[];
  hasShikimori: boolean;
  scoreCount: number | null;
  dubbers: string[];
  trailerYoutubeId: string | null;
};

function posterFromMaterialData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  return resolveMaterialPosterUrl(data as MaterialPosterSource);
}

function normalizePlayerLink(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("//")) return `https:${link}`;
  return link;
}

function normalizeDescription(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed || null;
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    apos: "'",
  };

  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[lower] ?? match;
  });
}

function getHtmlAttr(attrs: string, name: string): string | null {
  const attrName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${attrName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`, "i");
  const match = attrs.match(re);
  if (!match) return null;
  return decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "").trim();
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function escapeBbcodeLabel(text: string): string {
  return text.replace(/\[/g, "(").replace(/]/g, ")");
}

function shikimoriEntityTagFromHref(href: string): { tag: "anime" | "character" | "manga" | "person"; id: string } | null {
  let pathname: string;
  try {
    pathname = new URL(href, "https://shikimori.local").pathname;
  } catch {
    return null;
  }

  const match = pathname.match(/^\/(animes|characters|mangas|people)\/(\d+)(?:[-/]|$)/i);
  if (!match) return null;

  const tagByPath: Record<string, "anime" | "character" | "manga" | "person"> = {
    animes: "anime",
    characters: "character",
    mangas: "manga",
    people: "person",
  };

  return { tag: tagByPath[match[1].toLowerCase()], id: match[2] };
}

function convertHtmlLinkToBbcode(attrs: string, innerHtml: string): string {
  const label = decodeHtmlEntities(stripHtmlTags(innerHtml)).replace(/\s+/g, " ").trim();
  if (!label) return "";

  const href = getHtmlAttr(attrs, "href");
  if (!href) return label;

  const entity = shikimoriEntityTagFromHref(href);
  if (entity) {
    const safeLabel = escapeBbcodeLabel(label);
    return `[${entity.tag}=${entity.id}]${safeLabel}[/${entity.tag}]`;
  }

  const absoluteHref = href.startsWith("/") ? shikimoriSiteUrl(href) : href;
  if (/^https?:\/\//i.test(absoluteHref)) {
    return `[url=${absoluteHref}]${escapeBbcodeLabel(label)}[/url]`;
  }

  return label;
}

function shikimoriDescriptionHtmlToBbcode(html: string | null): string | null {
  if (!html) return null;

  const text = html
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\/\s*(p|div|li|blockquote|h[1-6])\s*>/gi, "\n\n")
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, innerHtml: string) =>
      convertHtmlLinkToBbcode(attrs, innerHtml),
    )
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, "[b]$2[/b]")
    .replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, "[i]$2[/i]")
    .replace(/<[^>]*>/g, "");

  return normalizeDescription(
    decodeHtmlEntities(text)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function resolveDescription(anime: ShikimoriAnime | null, fallbackDescription: string | null): string | null {
  return (
    shikimoriDescriptionHtmlToBbcode(anime?.description_html ?? null) ??
    normalizeDescription(anime?.description ?? null) ??
    fallbackDescription
  );
}

function sumScoreVotes(stats: ShikimoriAnime["rates_scores_stats"]): number | null {
  if (!stats?.length) return null;
  const total = stats.reduce((sum, row) => sum + row.value, 0);
  return total > 0 ? total : null;
}

function collectDubbers(anime: ShikimoriAnime | null, translations: KodikTranslationDto[]): string[] {
  const fromKodik = translations
    .filter((tr) => tr.translationType === "voice")
    .map((tr) => tr.translationTitle.trim())
    .filter(Boolean);
  const fromShikimori = anime?.fandubbers?.map((name) => name.trim()).filter(Boolean) ?? [];

  const seen = new Map<string, string>();
  for (const name of [...fromKodik, ...fromShikimori]) {
    const key = name.toLocaleLowerCase("ru-RU");
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

function mapGenres(
  anime: ShikimoriAnime | null,
  kodikGenres: string[],
): AnimePageDto["genres"] {
  const merged: AnimePageDto["genres"] = [];
  const seen = new Map<string, string>();

  for (const g of anime?.genres ?? []) {
    const name = (g.russian || g.name).trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    seen.set(key, name);
    merged.push({ id: g.id, name });
  }

  let kodikId = -1;
  for (const raw of kodikGenres) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    seen.set(key, name);
    merged.push({ id: kodikId, name });
    kodikId -= 1;
  }

  return merged;
}

function studioImageUrl(image: string | null | undefined): string | null {
  const url = shikimoriAssetUrl(image);
  if (!url || isShikimoriMissingImage(url)) return null;
  return url;
}

function mapStudioEntry(studio: ShikimoriStudio): AnimePageDto["studios"][number] {
  return {
    id: studio.id,
    name: studio.name,
    imageUrl: studioImageUrl(studio.image),
  };
}

function studioMergeKey(studio: AnimePageDto["studios"][number]): string {
  return studio.id > 0 ? `id:${studio.id}` : `name:${studio.name.toLocaleLowerCase("ru-RU")}`;
}

function mergeStudioLists(...lists: AnimePageDto["studios"][]): AnimePageDto["studios"] {
  const byKey = new Map<string, AnimePageDto["studios"][number]>();

  for (const list of lists) {
    for (const studio of list) {
      const key = studioMergeKey(studio);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, studio);
        continue;
      }
      if (!prev.imageUrl && studio.imageUrl) {
        byKey.set(key, studio);
      }
    }
  }

  return [...byKey.values()];
}

function studiosFromMaterialData(materials: Array<{ materialData: unknown }>): AnimePageDto["studios"] {
  for (const material of materials) {
    const cached = parseShikimoriAnimeFromMaterialData(material.materialData);
    if (!cached?.studios?.length) continue;
    return cached.studios.map(mapStudioEntry);
  }
  return [];
}

function resolveStudios(
  anime: ShikimoriAnime | null,
  materials: Array<{ materialData: unknown }>,
  kodikStudios: string[],
): AnimePageDto["studios"] {
  const merged = mergeStudioLists(
    anime?.studios?.length ? anime.studios.map(mapStudioEntry) : [],
    studiosFromMaterialData(materials),
  );

  if (merged.length > 0) return merged;

  return kodikStudios.map((name, index) => ({
    id: -(index + 1),
    name,
    imageUrl: null,
  }));
}

function screenshotsFromMaterialData(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  return parseScreenshotUrls((data as { screenshots?: unknown }).screenshots);
}

function mapAnimeToDto(
  shikimoriId: number,
  anime: ShikimoriAnime | null,
  translations: KodikTranslationDto[],
  fallbackPoster: string | null,
  fallbackTitle: string | null,
  kodikScreenshots: string[],
  kodikMeta: ReturnType<typeof extractKodikMaterialMeta>,
  metaMaterials: Array<{
    lastEpisode: number | null;
    episodesCount: number | null;
    materialData: unknown;
  }>,
  allMaterials: Array<{ materialData: unknown }>,
): AnimePageDto {
  const title = anime?.russian || anime?.name || fallbackTitle || "Без названия";
  const posterUrl =
    posterFromShikimoriAnime(anime) ??
    (fallbackPoster && !isShikimoriMissingImage(fallbackPoster) ? fallbackPoster : null);

  const episodes =
    resolveAnnouncedEpisodesTotalForShikimoriMaterials(shikimoriId, anime, metaMaterials) ??
    (anime?.episodes != null && anime.episodes > 0 ? anime.episodes : null);

  return {
    shikimoriId,
    title,
    titleOriginal: anime?.name ?? null,
    posterUrl,
    score: anime?.score ?? null,
    status: anime?.status ?? null,
    kind: anime?.kind ?? null,
    rating: anime?.rating ?? null,
    episodes,
    episodesAired: anime?.episodes_aired ?? null,
    duration: anime?.duration ?? null,
    airedOn: anime?.aired_on ?? null,
    releasedOn: anime?.released_on ?? null,
    description: resolveDescription(anime, kodikMeta.description),
    genres: mapGenres(anime, kodikMeta.genres),
    studios: resolveStudios(anime, allMaterials, kodikMeta.studios),
    synonyms: anime?.synonyms?.slice(0, 6) ?? [],
    shikimoriUrl: anime ? shikimoriSiteUrl(anime.url) : null,
    screenshots: uniqueScreenshotUrls([
      ...(anime?.screenshots ?? [])
        .map((s) => shikimoriAssetUrl(s.original ?? s.preview))
        .filter((url): url is string => Boolean(url)),
      ...kodikScreenshots,
    ]),
    translations,
    hasShikimori: Boolean(anime),
    scoreCount: sumScoreVotes(anime?.rates_scores_stats),
    dubbers: collectDubbers(anime, translations),
    trailerYoutubeId: pickYoutubeTrailerId(anime?.videos),
  };
}

export const getAnimePageData = cache(async (shikimoriId: number): Promise<AnimePageDto | null> => {
  await getShikimoriEndpoints();

  const [materials, releasePoster] = await Promise.all([
    prisma.kodikMaterial.findMany({
      where: { shikimoriId },
      orderBy: { kodikUpdatedAt: "desc" },
      select: {
        kodikId: true,
        translationId: true,
        title: true,
        translationTitle: true,
        translationType: true,
        lastSeason: true,
        lastEpisode: true,
        episodesCount: true,
        playerLink: true,
        quality: true,
        materialData: true,
        seasons: {
          orderBy: { seasonNumber: "asc" },
          select: { seasonNumber: true },
        },
      },
    }),
    prisma.kodikEpisodeRelease.findFirst({
      where: { shikimoriId },
      orderBy: { releasedAt: "desc" },
      select: { posterUrl: true },
    }),
  ]);

  const hasRealMaterials = materials.some((m) => !isShikimoriStubMaterial(m.kodikId));

  let anime: ShikimoriAnime | null = null;
  if (hasRealMaterials) {
    anime = await getShikimoriAnimeCachedOnly(shikimoriId);
    if (!anime) {
      anime = await loadStaleShikimoriAnimeFromCache(shikimoriId);
    }
    scheduleShikimoriAnimeRefresh(shikimoriId);
  } else {
    anime = await getShikimoriAnime(shikimoriId);
  }

  if (!anime && materials.length === 0) return null;

  const translations: KodikTranslationDto[] = materials
    .filter((m) => !isShikimoriStubMaterial(m.kodikId))
    .map((m) => ({
      kodikId: m.kodikId,
      translationId: m.translationId,
      translationTitle: m.translationTitle,
      translationType: m.translationType,
      lastSeason: m.lastSeason,
      lastEpisode: m.lastEpisode,
      availableSeasons: m.seasons.filter((season) => season.seasonNumber >= 0),
      playerLink: normalizePlayerLink(m.playerLink),
      quality: m.quality,
    }));

  const materialsForMeta = materials.filter((m) => !isShikimoriStubMaterial(m.kodikId));
  const metaMaterials = materialsForMeta.length > 0 ? materialsForMeta : materials;

  const fallbackPoster =
    metaMaterials.map((m) => posterFromMaterialData(m.materialData)).find(Boolean) ??
    (releasePoster?.posterUrl && !isShikimoriMissingImage(releasePoster.posterUrl)
      ? releasePoster.posterUrl
      : null);
  const fallbackTitle = metaMaterials[0]?.title ?? materials[0]?.title ?? null;
  const kodikScreenshots = uniqueScreenshotUrls(
    metaMaterials.flatMap((m) => screenshotsFromMaterialData(m.materialData)),
  );
  const kodikMeta = extractKodikMaterialMeta(metaMaterials.map((m) => m.materialData));

  let dto = mapAnimeToDto(
    shikimoriId,
    anime,
    translations,
    fallbackPoster,
    fallbackTitle,
    kodikScreenshots,
    kodikMeta,
    metaMaterials,
    materials,
  );

  if (!dto.posterUrl) {
    const discovered = await discoverPosterUrl(shikimoriId);
    if (discovered) {
      dto = { ...dto, posterUrl: discovered.url };
    }
  }

  return dto;
});
