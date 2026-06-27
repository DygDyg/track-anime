import type { Metadata } from "next";
import { labelKind, labelKindShort } from "@/lib/anime-labels";
import { shikimoriAvatarUrlLarge } from "@/lib/auth/shikimori-avatar";
import { resolvePosterUrl } from "@/lib/poster";
import { SITE_LOGO_ALT, SITE_LOGO_PATH, SITE_NAME, versionedAsset } from "@/lib/site-brand";
import { stripShikimoriBbcode } from "@/lib/shikimori-bbcode";
import { toAbsoluteUrl } from "@/lib/site-url";

export const META_TITLE_MAX = 36;
export const META_DESCRIPTION_MAX = 200;

export function truncateMetaTitle(title: string, maxLen = META_TITLE_MAX): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
}

export function buildMetaDescription(description: string | null | undefined, fallback: string): string {
  if (description) {
    const plain = stripShikimoriBbcode(description).replace(/\s+/g, " ").trim();
    if (plain) return plain;
  }
  return fallback;
}

export function formatMetaEpisodes(
  episodes: number | null,
  episodesAired: number | null,
): string | null {
  if (episodes == null && episodesAired == null) return null;
  if (episodes == null || episodes <= 0) {
    return episodesAired != null ? `${episodesAired} сер.` : null;
  }
  if (episodesAired == null) return `${episodes} сер.`;
  return `${episodesAired} из ${episodes} сер.`;
}

export function buildAnimeMetaStatsLine(input: {
  score: string | null;
  kind: string | null;
  episodes: number | null;
  episodesAired: number | null;
}): string {
  const parts: string[] = [];

  const kindShort = labelKindShort(input.kind);
  const kindLabel = labelKind(input.kind);
  if (kindShort && kindLabel) {
    parts.push(`${kindShort} (${kindLabel})`);
  } else if (kindShort ?? kindLabel) {
    parts.push(kindShort ?? kindLabel ?? "");
  }

  const episodesLabel = formatMetaEpisodes(input.episodes, input.episodesAired);
  if (episodesLabel) parts.push(episodesLabel);

  if (input.score) parts.push(`★ ${input.score}`);

  return parts.join(" · ");
}

function buildOgTitle(title: string, kind: string | null): string {
  const kindShort = labelKindShort(kind);
  if (!kindShort) return truncateMetaTitle(title);

  const prefix = `[${kindShort}] `;
  const shortTitle = truncateMetaTitle(title, META_TITLE_MAX - prefix.length);
  return `${prefix}${shortTitle}`;
}

function limitMetaDescription(text: string): string {
  if (text.length <= META_DESCRIPTION_MAX) return text;
  return `${text.slice(0, META_DESCRIPTION_MAX - 1).trimEnd()}…`;
}

function buildPosterImages(
  posterUrl: string | null,
  alt: string,
  shikimoriId?: number,
): Array<{ url: string; width: number; height: number; alt: string }> {
  const absolute = toAbsoluteUrl(resolvePosterUrl(posterUrl, { shikimoriId }));
  if (!absolute) return [];

  return [
    {
      url: absolute,
      width: 460,
      height: 690,
      alt,
    },
  ];
}

export function buildAnimePageMetadata(input: {
  title: string;
  description: string | null;
  posterUrl: string | null;
  shikimoriId: number;
  score: string | null;
  kind: string | null;
  episodes: number | null;
  episodesAired: number | null;
}): Metadata {
  const ogTitle = buildOgTitle(input.title, input.kind);
  const statsLine = buildAnimeMetaStatsLine(input);
  const descriptionBody = buildMetaDescription(
    input.description,
    `${input.title} — смотреть онлайн на ${SITE_NAME}`,
  );
  const pageDescription = limitMetaDescription(
    statsLine ? `${statsLine}. ${descriptionBody}` : descriptionBody,
  );
  const canonicalPath = `/anime/${input.shikimoriId}`;
  const images = buildPosterImages(input.posterUrl, `Постер «${input.title}»`, input.shikimoriId);
  const imageUrls = images.map((image) => image.url);

  return {
    title: { absolute: `${ogTitle} — ${SITE_NAME}` },
    description: pageDescription,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: ogTitle,
      description: pageDescription,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: "ru_RU",
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: pageDescription,
      images: imageUrls.length > 0 ? imageUrls : undefined,
    },
  };
}

export const defaultSiteDescription = "Трекер аниме — новые серии, списки, просмотр";

type OgImage = { url: string; width: number; height: number; alt: string };

function buildDefaultOgImages(): OgImage[] {
  const logoUrl = toAbsoluteUrl(versionedAsset(SITE_LOGO_PATH));
  if (!logoUrl) return [];

  return [
    {
      url: logoUrl,
      width: 512,
      height: 512,
      alt: SITE_LOGO_ALT,
    },
  ];
}

function buildSocialMetadata(input: {
  title: string;
  description: string;
  canonicalPath: string;
  images?: OgImage[];
  openGraphType?: "website" | "profile";
  twitterCard?: "summary" | "summary_large_image";
}): Metadata {
  const images = input.images?.length ? input.images : buildDefaultOgImages();
  const imageUrls = images.map((image) => image.url);
  const description = limitMetaDescription(input.description);
  const twitterCard =
    input.twitterCard ??
    (images[0] && images[0].width <= 200 && images[0].width === images[0].height
      ? "summary"
      : "summary_large_image");

  return {
    title: input.title,
    description,
    alternates: { canonical: input.canonicalPath },
    openGraph: {
      type: input.openGraphType ?? "website",
      title: input.title,
      description,
      url: input.canonicalPath,
      siteName: SITE_NAME,
      locale: "ru_RU",
      images,
    },
    twitter: {
      card: twitterCard,
      title: `${input.title} — ${SITE_NAME}`,
      description,
      images: imageUrls.length > 0 ? imageUrls : undefined,
    },
  };
}

/** OG/Twitter для обычных страниц сайта (логотип в превью). */
export function buildSitePageMetadata(input: {
  title: string;
  description: string;
  canonicalPath: string;
}): Metadata {
  return buildSocialMetadata({
    title: input.title,
    description: input.description,
    canonicalPath: input.canonicalPath,
  });
}

/** OG/Twitter для публичного профиля пользователя (аватар в превью). */
export function buildUserProfilePageMetadata(input: {
  nickname: string;
  avatar: string | null;
  canonicalPath: string;
  pageKind?: "profile" | "favorites";
}): Metadata {
  const title =
    input.pageKind === "favorites" ? `Списки ${input.nickname}` : input.nickname;
  const description =
    input.pageKind === "favorites"
      ? `Аниме-списки и закладки пользователя ${input.nickname} на ${SITE_NAME}`
      : `Профиль ${input.nickname} на ${SITE_NAME} — списки аниме, статистика и друзья`;

  const avatarUrl = shikimoriAvatarUrlLarge(input.avatar);
  const images: OgImage[] = avatarUrl
    ? [
        {
          url: avatarUrl,
          width: 160,
          height: 160,
          alt: `Аватар ${input.nickname}`,
        },
      ]
    : buildDefaultOgImages();

  return buildSocialMetadata({
    title,
    description,
    canonicalPath: input.canonicalPath,
    images,
    openGraphType: "profile",
    twitterCard: avatarUrl ? "summary" : "summary_large_image",
  });
}

export function buildDefaultOpenGraph(): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: defaultSiteDescription,
    images: [
      {
        url: versionedAsset(SITE_LOGO_PATH),
        width: 512,
        height: 512,
        alt: SITE_LOGO_ALT,
      },
    ],
  };
}
