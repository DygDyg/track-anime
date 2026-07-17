import type { AnimePageDto } from "@/lib/anime-page";
import {
  formatReleaseSeasonBadge,
  labelKind,
  labelRating,
  labelStatus,
} from "@/lib/anime-labels";
import { coverCacheUrl } from "@/lib/poster";
import { stripShikimoriBbcode } from "@/lib/shikimori-bbcode";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";

export type AnimeShareCopyFormat = "plain" | "discord" | "telegram" | "vk";

const VK_SECTION_RULE = "━━━━━━━━━━━━━━━━━━━━";
const VK_DESCRIPTION_MAX_LEN = 280;

function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getAnimePagePath(shikimoriId: number): string {
  return `/anime/${shikimoriId}`;
}

export function getAnimePageUrl(origin: string, shikimoriId: number): string {
  return absoluteUrl(origin, getAnimePagePath(shikimoriId));
}

function getYear(iso: string | null): string {
  if (!iso) return "—";
  const match = iso.match(/^(\d{4})/);
  if (match) return match[1];
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : String(date.getFullYear());
}

function episodesText(anime: AnimePageDto): string {
  if (anime.episodes != null) {
    return `${anime.episodesAired ?? "?"}/${anime.episodes}`;
  }
  if (anime.episodesAired != null) return String(anime.episodesAired);
  return "—";
}

function genresText(anime: AnimePageDto): string {
  return anime.genres.map((genre) => genre.name).join(", ") || "—";
}

function studiosText(anime: AnimePageDto): string {
  return anime.studios.map((studio) => studio.name).join(", ") || "—";
}

function kindLabel(anime: AnimePageDto): string {
  return anime.kind?.toUpperCase() ?? labelKind(anime.kind)?.toUpperCase() ?? "?";
}

function statusText(anime: AnimePageDto): string {
  return labelStatus(anime.status) ?? anime.status ?? "—";
}

function ratingText(anime: AnimePageDto): string {
  return labelRating(anime.rating) ?? anime.rating ?? "—";
}

function durationText(anime: AnimePageDto): string {
  return anime.duration != null ? `${anime.duration} мин.` : "—";
}

function seasonText(anime: AnimePageDto): string {
  return formatReleaseSeasonBadge(anime.airedOn, anime.releasedOn) ?? getYear(anime.airedOn ?? anime.releasedOn);
}

function discordRelativeTime(anime: AnimePageDto): string {
  const iso = anime.releasedOn ?? anime.airedOn;
  if (!iso) return "";
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts)) return "";
  return `Вышло <t:${ts}:R>`;
}

function discordGenres(anime: AnimePageDto, origin: string): string {
  if (anime.genres.length === 0) return "—";
  return anime.genres
    .map((genre) => {
      const href = absoluteUrl(origin, `/search?genre=${encodeURIComponent(genre.name)}`);
      return `[${genre.name}](<${href}>)`;
    })
    .join(" ");
}

function plainDescription(anime: AnimePageDto): string {
  if (!anime.description) return "";
  return stripShikimoriBbcode(anime.description);
}

function sharePosterUrl(anime: AnimePageDto, origin: string): string {
  return absoluteUrl(origin, coverCacheUrl(anime.shikimoriId, "full"));
}

function truncateShareDescription(text: string, maxLen = VK_DESCRIPTION_MAX_LEN): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;

  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > maxLen * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

function vkUrlLine(emoji: string, label: string, url: string): string {
  return `${emoji} ${label}: ${url}`;
}

function vkStatsLines(anime: AnimePageDto): string[] {
  return [
    `🎬 Серии — ${episodesText(anime)}`,
    `⏱ Длительность — ${durationText(anime)}`,
    `🎨 Студия — ${studiosText(anime)}`,
    `📅 Сезон — ${seasonText(anime)}`,
    `🏷️ Жанры — ${genresText(anime)}`,
    `📌 Статус — ${statusText(anime)}`,
    `🎯 Возраст — ${ratingText(anime)}`,
    `🌟 Shikimori — ${anime.score ?? "—"}`,
  ];
}

function vkHashtagLabel(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "");

  if (!normalized) return null;
  return normalized.slice(0, 48);
}

function vkHashtags(anime: AnimePageDto): string {
  const tags: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined) => {
    const label = raw ? vkHashtagLabel(raw) : null;
    if (!label || seen.has(label)) return;
    seen.add(label);
    tags.push(`#${label}`);
  };

  push(anime.title);
  push("anime");
  for (const studio of anime.studios.slice(0, 1)) {
    push(studio.name);
  }
  if (anime.titleOriginal && anime.titleOriginal !== anime.title) {
    push(anime.titleOriginal);
  }

  return tags.slice(0, 5).join(" ");
}

export function buildPlainShareText(anime: AnimePageDto, origin: string): string {
  const pageUrl = getAnimePageUrl(origin, anime.shikimoriId);
  const lines = [
    `[${kindLabel(anime)}] ${anime.title}`,
    "",
    `Серии: ${episodesText(anime)}`,
    `Длительность: ${durationText(anime)}`,
    `Студия: ${studiosText(anime)}`,
    `Сезон: ${seasonText(anime)}`,
    `Жанры: ${genresText(anime)}`,
    `Статус: ${statusText(anime)}`,
    `Возрастной рейтинг: ${ratingText(anime)}`,
    anime.score ? `Рейтинг Shikimori: ${anime.score}` : null,
    "",
    `Track Anime: ${pageUrl}`,
    anime.shikimoriUrl ? `Shikimori: ${anime.shikimoriUrl}` : null,
  ].filter((line): line is string => line != null);

  const description = plainDescription(anime);
  if (description) {
    lines.push("", description);
  }

  return lines.join("\n").trim();
}

export function buildDiscordShareText(anime: AnimePageDto, origin: string): string {
  const pageUrl = getAnimePageUrl(origin, anime.shikimoriId);
  const shikimoriUrl = anime.shikimoriUrl ?? shikimoriSiteUrl(`/animes/${anime.shikimoriId}`);
  const relativeTime = discordRelativeTime(anime);
  const posterUrl = sharePosterUrl(anime, origin);

  return `
~~                                                                                                                                                                                          ~~
#  [${kindLabel(anime)}] ${anime.title}

${relativeTime}

> 🎬 **Серии:** ${episodesText(anime)}
> ⏰ **Длительность:** ${durationText(anime)}
> 🎨 **Студия:** ${studiosText(anime)}
> 📅 **Сезон:** ${seasonText(anime)}
> 🏷️ **Жанры:** ${discordGenres(anime, origin)}
> 📌 **Статус:** ${statusText(anime)}
> 🎯 **Возрастной рейтинг:** ${ratingText(anime)}
> 🌟 **Рейтинг shikimori:** ${anime.score ?? "—"}

[Открыть на Track Anime](<${pageUrl}>)
[Открыть на shikimori](<${shikimoriUrl}>)

${posterUrl ? `[Обложка](${posterUrl})` : ""}
`.trim();
}

export function buildTelegramShareText(anime: AnimePageDto, origin: string): string {
  const pageUrl = getAnimePageUrl(origin, anime.shikimoriId);
  const shikimoriUrl = anime.shikimoriUrl ?? shikimoriSiteUrl(`/animes/${anime.shikimoriId}`);
  const description = plainDescription(anime);
  const posterUrl = sharePosterUrl(anime, origin);

  return `

**[${kindLabel(anime)}]**  \`${anime.title}\`

${posterUrl ? `||🖼️ [Обложка] ${posterUrl}||` : ""}

    | 🎬 **Серии:** __${episodesText(anime)}__
    | ⏱ **Длительность:** __${durationText(anime)}__
    | 🎨 **${studiosText(anime)}**
    | 📅 **Сезон:** __${seasonText(anime)}__
    | 🏷️ **Жанры:** __${genresText(anime)}__
    | 📌 **Статус:** __${statusText(anime)}__
    | 🎯 **Возрастной рейтинг:** __${ratingText(anime)}__
    | 🌟 **Рейтинг shikimori:** __${anime.score ?? "—"}__

🔗 [Track Anime]: ${pageUrl}
🌐 [shikimori]: ${shikimoriUrl}

${description ? `__${description}__` : ""}

`.trim();
}

export function buildVkShareText(anime: AnimePageDto, origin: string): string {
  const pageUrl = getAnimePageUrl(origin, anime.shikimoriId);
  const shikimoriUrl = anime.shikimoriUrl ?? shikimoriSiteUrl(`/animes/${anime.shikimoriId}`);
  const description = plainDescription(anime);
  const hashtags = vkHashtags(anime);
  const posterUrl = sharePosterUrl(anime, origin);

  const lines: string[] = [];

  if (posterUrl) {
    lines.push(vkUrlLine("🖼", "Обложка", posterUrl));
  }

  lines.push(`【 ${kindLabel(anime)} 】 ${anime.title}`, VK_SECTION_RULE, ...vkStatsLines(anime), VK_SECTION_RULE);
  lines.push(vkUrlLine("▶", "Смотреть на Track Anime", pageUrl));
  lines.push(vkUrlLine("📖", "Карточка на Shikimori", shikimoriUrl));

  if (description) {
    lines.push(truncateShareDescription(description));
  }

  if (hashtags) {
    lines.push(hashtags);
  }

  return lines.join("\n").trim();
}

export function buildVkShareUrl(anime: AnimePageDto, origin: string): string {
  const posterUrl = sharePosterUrl(anime, origin);
  const url = new URL("https://vk.com/share.php");
  url.searchParams.set("url", getAnimePageUrl(origin, anime.shikimoriId));
  url.searchParams.set(
    "title",
    `Серии: ${episodesText(anime)} | [${kindLabel(anime)}] ${anime.title}`,
  );
  if (posterUrl) url.searchParams.set("image", posterUrl);
  url.searchParams.set("noparse", "true");
  return url.toString();
}

export function buildAnimeShareText(
  anime: AnimePageDto,
  origin: string,
  format: AnimeShareCopyFormat,
): string {
  switch (format) {
    case "discord":
      return buildDiscordShareText(anime, origin);
    case "telegram":
      return buildTelegramShareText(anime, origin);
    case "vk":
      return buildVkShareText(anime, origin);
    default:
      return buildPlainShareText(anime, origin);
  }
}
