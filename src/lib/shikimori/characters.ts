import { unstable_cache } from "next/cache";
import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";
import { shikimoriFetch } from "@/lib/shikimori/client";
import { shikimoriAssetUrl, shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import type { ShikimoriImage } from "@/lib/shikimori/types";

export type ShikimoriCharacter = {
  id: number;
  name: string;
  russian: string | null;
  image: ShikimoriImage | null;
  description: string | null;
  description_html?: string | null;
};

export type CharacterHoverPreview = {
  id: number;
  title: string;
  imageUrl: string | null;
  description: string | null;
  profileUrl: string;
};

type CharacterPageFallback = {
  imageUrl: string | null;
  description: string | null;
};

async function fetchCharacterFromApi(id: number): Promise<ShikimoriCharacter | null> {
  return shikimoriFetch<ShikimoriCharacter>(`/characters/${id}`);
}

function normalizeDescription(text: string | null | undefined): string | null {
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

function htmlToPlainDescription(html: string | null | undefined): string | null {
  if (!html) return null;

  const text = html
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|blockquote|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");

  return normalizeDescription(
    decodeHtmlEntities(text)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function resolveCharacterDescription(character: ShikimoriCharacter): string | null {
  return normalizeDescription(character.description) ?? htmlToPlainDescription(character.description_html);
}

function extractMetaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta\\b([^>]*(?:property|name|itemprop)=["']${property}["'][^>]*)>`, "i");
  const match = html.match(re);
  if (!match) return null;
  return getHtmlAttr(match[1], "content");
}

function extractCharacterPageImageUrl(html: string): string | null {
  return (
    extractMetaContent(html, "og:image") ??
    extractMetaContent(html, "twitter:image") ??
    extractMetaContent(html, "image")
  );
}

function extractCharacterPageDescription(html: string): string | null {
  const meta =
    extractMetaContent(html, "description") ?? extractMetaContent(html, "og:description");
  if (meta && !/^(?:описание|нет описания)$/i.test(meta.trim())) return meta;

  const block = html.match(/<div\b[^>]*class=["'][^"']*c-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!block) return null;

  const text = htmlToPlainDescription(block[1]);
  if (!text || /^(?:описание|нет описания)$/i.test(text)) return null;
  return text;
}

async function fetchCharacterPageFallback(id: number): Promise<CharacterPageFallback> {
  const response = await fetch(shikimoriSiteUrl(`/characters/${id}`), {
    headers: {
      "User-Agent": getShikimoriUserAgent() || "TrackAnime",
      Accept: "text/html",
    },
    next: { revalidate: 86_400 },
  });

  if (!response.ok) return { imageUrl: null, description: null };

  const html = await response.text();
  return {
    imageUrl: extractCharacterPageImageUrl(html),
    description: extractCharacterPageDescription(html),
  };
}

export async function getShikimoriCharacter(id: number): Promise<ShikimoriCharacter | null> {
  return unstable_cache(
    async () => fetchCharacterFromApi(id),
    ["shikimori-character-v3", String(id)],
    { revalidate: 86_400 },
  )();
}

export async function buildCharacterHoverPreview(id: number): Promise<CharacterHoverPreview | null> {
  const character = await getShikimoriCharacter(id);
  if (!character) return null;

  const imageUrl = shikimoriAssetUrl(
    character.image?.original ?? character.image?.preview ?? character.image?.x96 ?? null,
  );
  const description = resolveCharacterDescription(character);
  const pageFallback =
    imageUrl && description ? null : await fetchCharacterPageFallback(character.id).catch(() => null);

  return {
    id: character.id,
    title: character.russian?.trim() || character.name,
    imageUrl: pageFallback?.imageUrl ?? imageUrl ?? null,
    description: description ?? pageFallback?.description ?? null,
    profileUrl: shikimoriSiteUrl(`/characters/${character.id}`),
  };
}
