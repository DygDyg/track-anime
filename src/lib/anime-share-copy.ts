import type { AnimePageDto } from "@/lib/anime-page";
import {
  formatReleaseSeasonBadge,
  labelKind,
  labelRating,
  labelStatus,
} from "@/lib/anime-labels";
import { stripShikimoriBbcode } from "@/lib/shikimori-bbcode";

export type AnimeShareCopyFormat = "plain" | "discord" | "telegram";

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
  const shikimoriUrl = anime.shikimoriUrl ?? `https://shikimori.one/animes/${anime.shikimoriId}`;
  const relativeTime = discordRelativeTime(anime);

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

${anime.posterUrl ? `[Обложка](${anime.posterUrl})` : ""}
`.trim();
}

export function buildTelegramShareText(anime: AnimePageDto, origin: string): string {
  const pageUrl = getAnimePageUrl(origin, anime.shikimoriId);
  const shikimoriUrl = anime.shikimoriUrl ?? `https://shikimori.one/animes/${anime.shikimoriId}`;
  const description = plainDescription(anime);

  return `

**[${kindLabel(anime)}]**  \`${anime.title}\`

${anime.posterUrl ? `||🖼️ [Обложка] ${anime.posterUrl}||` : ""}

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

export function buildVkShareUrl(anime: AnimePageDto, origin: string): string {
  const url = new URL("https://vk.com/share.php");
  url.searchParams.set("url", getAnimePageUrl(origin, anime.shikimoriId));
  url.searchParams.set(
    "title",
    `Серии: ${episodesText(anime)} | [${kindLabel(anime)}] ${anime.title}`,
  );
  if (anime.posterUrl) url.searchParams.set("image", anime.posterUrl);
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
    default:
      return buildPlainShareText(anime, origin);
  }
}
