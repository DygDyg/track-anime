import { extractScoreFromMaterialData } from "@/lib/anime-score";
import {
  formatDurationRu,
  formatReleaseSeasonBadge,
  labelRating,
} from "@/lib/anime-labels";
import type { HistoryNewMaterialRow } from "@/lib/history-new-match";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";
import { buildEpisodeLabel } from "@/lib/notifications/templates";
import { isValidImageUrl, normalizeDirectImageUrl } from "@/lib/poster";
import { parseScreenshotUrls, uniqueScreenshotUrls } from "@/lib/screenshots";
import { loadShikimoriAnimeFromCache } from "@/lib/shikimori/anime-cache";
import { shikimoriAssetUrl } from "@/lib/shikimori/client";
import type { ShikimoriAnime } from "@/lib/shikimori/types";

export type NotificationAnimeMeta = {
  duration: string;
  releaseSeason: string;
  rating: string;
  ageRating: string;
  description: string;
  screenshot1: string;
  screenshot2: string;
  screenshot3: string;
  screenshot4: string;
};

function readAnimeTitle(material: HistoryNewMaterialRow): string {
  const data = material.materialData as { anime_title?: string } | null;
  return data?.anime_title?.trim() || material.title;
}

function readPosterUrl(material: HistoryNewMaterialRow): string | null {
  const data = material.materialData as MaterialPosterSource | null;
  return resolveMaterialPosterUrl({
    anime_poster_url: data?.anime_poster_url ?? data?.poster_url ?? data?.worldart_poster_url,
    worldart_link: data?.worldart_link,
  });
}

function buildSiteBaseUrl(): string {
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function buildPageUrl(shikimoriId: number): string {
  return `${buildSiteBaseUrl()}/anime/${shikimoriId}`;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function readMaterialDataRecord(materialData: unknown): Record<string, unknown> | null {
  if (!materialData || typeof materialData !== "object") return null;
  return materialData as Record<string, unknown>;
}

function readIsoDate(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function readDurationMinutes(
  record: Record<string, unknown> | null,
  anime: ShikimoriAnime | null,
): number | null {
  if (anime?.duration != null && anime.duration > 0) return anime.duration;

  const raw = record?.duration;
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function readAgeRating(
  record: Record<string, unknown> | null,
  anime: ShikimoriAnime | null,
): string {
  const shikimoriLabel = labelRating(anime?.rating ?? null);
  if (shikimoriLabel) return shikimoriLabel;

  const mpaa = record?.rating_mpaa;
  if (typeof mpaa === "string" && mpaa.trim()) return mpaa.trim();

  const minimalAge = record?.minimal_age;
  if (typeof minimalAge === "number" && minimalAge > 0) return `${minimalAge}+`;
  if (typeof minimalAge === "string" && minimalAge.trim()) {
    const parsed = Number.parseInt(minimalAge, 10);
    if (Number.isFinite(parsed) && parsed > 0) return `${parsed}+`;
  }

  return "";
}

function readDescription(
  record: Record<string, unknown> | null,
  anime: ShikimoriAnime | null,
): string {
  const candidates = [
    anime?.description,
    record?.anime_description,
    record?.description,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    return stripHtml(candidate);
  }

  return "";
}

function readRating(
  record: Record<string, unknown> | null,
  anime: ShikimoriAnime | null,
): string {
  if (anime?.score?.trim()) return anime.score.trim();
  return extractScoreFromMaterialData(record) ?? "";
}

function readScreenshotUrls(
  record: Record<string, unknown> | null,
  anime: ShikimoriAnime | null,
): string[] {
  const fromShikimori = (anime?.screenshots ?? [])
    .map((shot) => shikimoriAssetUrl(shot.original ?? shot.preview))
    .filter((url): url is string => Boolean(url));

  return uniqueScreenshotUrls([
    ...fromShikimori,
    ...parseScreenshotUrls(record?.screenshots),
  ]);
}

function padScreenshotSlots(urls: string[]): [string, string, string, string] {
  return [urls[0] ?? "", urls[1] ?? "", urls[2] ?? "", urls[3] ?? ""];
}

export async function resolveNotificationAnimeMeta(
  shikimoriId: number,
  materialData: unknown,
): Promise<NotificationAnimeMeta> {
  const anime = await loadShikimoriAnimeFromCache(shikimoriId);
  const record = readMaterialDataRecord(materialData);
  const screenshots = readScreenshotUrls(record, anime);
  const [screenshot1, screenshot2, screenshot3, screenshot4] = padScreenshotSlots(screenshots);

  const airedOn = readIsoDate(record, ["aired_at", "aired_on"]) ?? anime?.aired_on ?? null;
  const releasedOn =
    readIsoDate(record, ["released_at", "released_on"]) ?? anime?.released_on ?? null;

  return {
    duration: formatDurationRu(readDurationMinutes(record, anime)) ?? "",
    releaseSeason: formatReleaseSeasonBadge(airedOn, releasedOn) ?? "",
    rating: readRating(record, anime),
    ageRating: readAgeRating(record, anime),
    description: readDescription(record, anime),
    screenshot1,
    screenshot2,
    screenshot3,
    screenshot4,
  };
}

export function resolveNotificationPosterUrl(
  payload: Pick<HistoryNewNotificationPayload, "posterUrl" | "shikimoriId">,
): string {
  const base = buildSiteBaseUrl();

  if (payload.posterUrl && isValidImageUrl(payload.posterUrl)) {
    const url = payload.posterUrl.trim();
    if (url.startsWith("/")) return `${base}${url}`;
    return normalizeDirectImageUrl(url);
  }

  return `${base}/api/cover?id=${payload.shikimoriId}`;
}

export async function buildHistoryNewNotificationPayload(input: {
  material: HistoryNewMaterialRow;
  seasonNumber: number;
  episodeNumber: number;
  watchedSeasonNumber: number;
  watchedEpisodeNumber: number;
  animeMeta?: NotificationAnimeMeta;
}): Promise<HistoryNewNotificationPayload | null> {
  const shikimoriId = input.material.shikimoriId;
  if (!shikimoriId) return null;

  const animeMeta =
    input.animeMeta ??
    (await resolveNotificationAnimeMeta(shikimoriId, input.material.materialData));

  return {
    materialId: input.material.kodikId,
    shikimoriId,
    animeTitle: readAnimeTitle(input.material),
    seasonNumber: input.seasonNumber,
    episodeNumber: input.episodeNumber,
    translationName: input.material.translationTitle,
    posterUrl: readPosterUrl(input.material),
    pageUrl: buildPageUrl(shikimoriId),
    watchedSeasonNumber: input.watchedSeasonNumber,
    watchedEpisodeNumber: input.watchedEpisodeNumber,
    ...animeMeta,
  };
}

export function formatHistoryNewNotificationTitle(payload: HistoryNewNotificationPayload): string {
  return `Новая серия: ${payload.animeTitle}`;
}

export function formatHistoryNewNotificationBody(payload: HistoryNewNotificationPayload): string {
  const episodeLabel = buildEpisodeLabel(payload.seasonNumber, payload.episodeNumber);
  return `${episodeLabel} · ${payload.translationName}`;
}
