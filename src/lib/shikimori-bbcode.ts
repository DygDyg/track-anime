/** Убирает BBCode Shikimori для plain-text (meta, превью). */
export function stripShikimoriBbcode(text: string): string {
  return text
    .replace(/\[br\s*\/?\]/gi, " ")
    .replace(/\[replies=[^\]]*]/gi, " ")
    .replace(/\[(?:url|character|anime|manga)(?:=[^\]]*)?]([\s\S]*?)\[\/(?:url|character|anime|manga)]/gi, "$1")
    .replace(/\[(?:character|anime|manga)=(\d+)(?:\s+([^\]]*))?\]/gi, (_, _id, slug) => slug?.trim() || "")
    .replace(/\[(?:b|i|u|s)]([\s\S]*?)\[\/(?:b|i|u|s)]/gi, "$1")
    .replace(/\[[^\]]*]/g, "")
    .replace(/(?<![0-9]):([a-z][a-z0-9 _-]*):/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `:ololo:` / `:dont want:` — без крайних двоеточий. */
export const SHIKIMORI_SMILEY_RE = /(?<![0-9]):([a-z][a-z0-9 _-]*):/gi;

export function parseShikimoriRepliesIds(attr: string | undefined): string[] {
  if (!attr) return [];
  return attr
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export const SHIKIMORI_REPLIES_TAG_RE = /\[replies=([^\]]+)]/gi;

/** Все ID из `[replies=1,2]` в тексте. */
export function extractShikimoriRepliesIdsFromText(text: string): number[] {
  const ids = new Set<number>();
  const re = new RegExp(SHIKIMORI_REPLIES_TAG_RE.source, SHIKIMORI_REPLIES_TAG_RE.flags);

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    for (const part of parseShikimoriRepliesIds(match[1])) {
      const id = Number(part);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
  }

  return [...ids];
}

export function shikimoriSmileyToken(name: string): string {
  return `:${name}:`;
}

export function shikimoriSmileyImageUrl(token: string): string {
  const path = `/images/smileys/${token.replace(/ /g, "%20")}.gif`;
  return path;
}

/** `[character=234656 asa]` → `{ id: "234656", slug: "asa" }` */
export function parseShikimoriEntityAttr(attr: string | undefined): { id: string; slug: string | null } | null {
  if (!attr) return null;
  const match = attr.trim().match(/^(\d+)(?:\s+(.+))?$/);
  if (!match) return null;
  const slug = match[2]?.trim() || null;
  return { id: match[1], slug };
}

/** `[character=234656 asa]` → `234656` */
export function parseShikimoriEntityId(attr: string | undefined): string | null {
  return parseShikimoriEntityAttr(attr)?.id ?? null;
}

export type ShikimoriEntityUrlKind = "anime" | "character" | "manga";

export type ShikimoriEntityUrl = {
  kind: ShikimoriEntityUrlKind;
  id: number;
  slug: string | null;
  href: string;
};

/** `https://shikimori.io/characters/1257-gendou-ikari` */
const SHIKIMORI_ENTITY_PATH_RE = /^\/(animes|characters|mangas)\/(\d+)(?:-([a-z0-9-]+))?\/?$/i;

const SHIKIMORI_ENTITY_KIND: Record<string, ShikimoriEntityUrlKind> = {
  animes: "anime",
  characters: "character",
  mangas: "manga",
};

/** Plain http(s) URLs in comment text. */
export const AUTOLINK_URL_RE = /https?:\/\/[^\s<>\[\]"']+/gi;

export function trimAutolinkUrl(raw: string): { href: string; trailing: string } {
  let href = raw;
  let trailing = "";

  while (href.length > 0) {
    const char = href.at(-1);
    if (!char || !/[),.;:!?]/.test(char)) break;
    if (char === ")" && (href.match(/\(/g)?.length ?? 0) >= (href.match(/\)/g)?.length ?? 0)) break;
    trailing = char + trailing;
    href = href.slice(0, -1);
  }

  return { href, trailing };
}

export function parseShikimoriEntityUrl(rawUrl: string): ShikimoriEntityUrl | null {
  const { href } = trimAutolinkUrl(rawUrl.trim());
  if (!href) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (!/^(?:www\.)?shikimori\.(io|one)$/i.test(url.hostname)) return null;

  const match = url.pathname.match(SHIKIMORI_ENTITY_PATH_RE);
  if (!match) return null;

  const kind = SHIKIMORI_ENTITY_KIND[match[1].toLowerCase()];
  const id = Number(match[2]);
  if (!kind || !Number.isFinite(id) || id <= 0) return null;

  return {
    kind,
    id,
    slug: match[3] ?? null,
    href: url.toString(),
  };
}

export function parseLocalAnimeUrl(rawUrl: string): number | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const url = trimmed.startsWith("/") ? new URL(trimmed, "https://track-anime.local") : new URL(trimmed);
    const match = url.pathname.match(/^\/anime\/(\d+)\/?$/);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    const relative = trimmed.match(/^\/anime\/(\d+)\/?$/);
    if (!relative) return null;
    const id = Number(relative[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}

export function autolinkUrlLabel(href: string): string {
  const entity = parseShikimoriEntityUrl(href);
  if (entity?.slug) {
    return entity.slug.replace(/-/g, " ");
  }
  return href;
}

export type ParsedQuoteAttr = {
  nickname: string | null;
  commentId: number | null;
  userId: number | null;
};

/** `[quote=c13423483;1190009;Drago_]` или `[quote=Nickname]`. */
export function parseQuoteAttr(attr: string | undefined): ParsedQuoteAttr {
  if (!attr?.trim()) return { nickname: null, commentId: null, userId: null };

  const trimmed = attr.trim();
  const typedMatch = trimmed.match(/^([mtcr])(\d+);(\d+);([\s\S]+)$/);
  if (typedMatch) {
    const id = Number(typedMatch[2]);
    const userId = Number(typedMatch[3]);
    return {
      nickname: typedMatch[4].trim() || null,
      commentId: typedMatch[1] === "c" && Number.isFinite(id) ? id : null,
      userId: Number.isFinite(userId) ? userId : null,
    };
  }

  const commentMatch = trimmed.match(/^c?(\d+);(\d+);([\s\S]+)$/);
  if (commentMatch) {
    const commentId = Number(commentMatch[1]);
    const userId = Number(commentMatch[2]);
    return {
      nickname: commentMatch[3].trim() || null,
      commentId: Number.isFinite(commentId) ? commentId : null,
      userId: Number.isFinite(userId) ? userId : null,
    };
  }

  return { nickname: trimmed, commentId: null, userId: null };
}

/** `>?c123;456;Nick` + `> ||text||` → `[quote=...]`. */
export function preprocessShikimoriCommentText(text: string): string {
  let result = text.replace(/\[ban=\d+]/gi, "");

  result = result.replace(
    /^>\?([mtcr]?)(\d+);(\d+);([^\n]+)\n(?:>\s*)?\|\|([\s\S]*?)\|\|/gm,
    (_match, prefix: string, id1: string, id2: string, nick: string, content: string) => {
      const type = prefix || "c";
      return `[quote=${type}${id1};${id2};${nick.trim()}]${content.trim()}[/quote]`;
    },
  );

  return result;
}

export type ShikimoriImageSize = {
  width?: number;
  height?: number;
};

export function parseShikimoriImageSizeAttrs(raw: string | undefined): ShikimoriImageSize {
  if (!raw) return {};
  const size: ShikimoriImageSize = {};

  const wxh = raw.match(/(?:^|\s)(\d+)x(\d+)(?:\s|$)/i);
  if (wxh) {
    size.width = Number(wxh[1]);
    size.height = Number(wxh[2]);
    return size;
  }

  const w = raw.match(/(?:^|\s)w(?:idth)?=(\d+)/i);
  const h = raw.match(/(?:^|\s)h(?:eight)?=(\d+)/i);
  if (w) size.width = Number(w[1]);
  if (h) size.height = Number(h[1]);

  return size;
}

const SHIKIMORI_PEOPLE_PATH_RE = /^\/people\/(\d+)(?:-([a-z0-9-]+))?\/?$/i;

export function parseShikimoriPeopleUrl(rawUrl: string): { id: number; slug: string | null; href: string } | null {
  const { href } = trimAutolinkUrl(rawUrl.trim());
  if (!href) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (!/^(?:www\.)?shikimori\.(io|one)$/i.test(url.hostname)) return null;

  const match = url.pathname.match(SHIKIMORI_PEOPLE_PATH_RE);
  if (!match) return null;

  const id = Number(match[1]);
  if (!Number.isFinite(id) || id <= 0) return null;

  return { id, slug: match[2] ?? null, href: url.toString() };
}
