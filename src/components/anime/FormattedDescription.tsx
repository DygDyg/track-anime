"use client";

import { Fragment, type ReactNode } from "react";
import { AnimeLink } from "@/components/AnimeLink";
import { BbcodeInlineAnimeLink } from "@/components/anime/BbcodeInlineAnimeLink";
import { BbcodeInlineCharacterLink } from "@/components/anime/BbcodeInlineCharacterLink";
import { BbcodeInlineSpoiler } from "@/components/anime/BbcodeInlineSpoiler";
import { BbcodeSpoilerBlock } from "@/components/anime/BbcodeSpoilerBlock";
import { BbcodeQuoteBlock } from "@/components/anime/BbcodeQuoteBlock";
import { BbcodeReplyFallback, BbcodeReplyQuote } from "@/components/anime/BbcodeReplyQuote";
import { BbcodeShikimoriImage } from "@/components/anime/BbcodeShikimoriImage";
import type { CommentReplyDto } from "@/lib/anime-comments";
import {
  AUTOLINK_URL_RE,
  autolinkUrlLabel,
  parseLocalAnimeUrl,
  parseQuoteAttr,
  parseShikimoriEntityAttr,
  parseShikimoriEntityId,
  parseShikimoriEntityUrl,
  parseShikimoriImageSizeAttrs,
  parseShikimoriPeopleUrl,
  parseShikimoriRepliesIds,
  preprocessShikimoriCommentText,
  SHIKIMORI_SMILEY_RE,
  shikimoriSmileyImageUrl,
  shikimoriSmileyToken,
  trimAutolinkUrl,
} from "@/lib/shikimori-bbcode";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";

const ALLOWED_SIMPLE_TAGS = new Set(["b", "i", "u", "s"]);
const VOID_TAGS = new Set(["replies"]);
const BLOCK_TAGS = new Set(["quote", "spoiler", "spoiler_block", "center", "color", "img", "poster"]);
const ENTITY_TAGS = new Set(["character", "anime", "manga", "person"]);

const COLOR_CLASS: Record<string, string> = {
  gray: "text-muted",
  grey: "text-muted",
  red: "text-red-400",
  green: "text-green-400",
  blue: "text-blue-400",
  orange: "text-orange-400",
  yellow: "text-yellow-400",
  purple: "text-purple-400",
};

export type BbcodeParseOptions = {
  replies?: Record<string, CommentReplyDto>;
  images?: Record<string, string>;
  enableEntityHover?: boolean;
  nested?: boolean;
};

function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

function parseTagOpen(raw: string): { name: string; attr?: string } | null {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "img" || lower.startsWith("img ")) {
    return { name: "img", attr: lower === "img" ? undefined : trimmed.slice(3).trim() };
  }

  const eq = trimmed.indexOf("=");
  if (eq === -1) {
    const name = lower;
    if (
      ALLOWED_SIMPLE_TAGS.has(name) ||
      BLOCK_TAGS.has(name) ||
      name === "url" ||
      name === "center"
    ) {
      return { name };
    }
    return null;
  }

  const name = trimmed.slice(0, eq).toLowerCase();
  const attr = trimmed.slice(eq + 1);
  if (
    name === "url" ||
    ENTITY_TAGS.has(name) ||
    BLOCK_TAGS.has(name) ||
    name === "replies" ||
    name === "image" ||
    name === "poster" ||
    name === "color" ||
    name === "spoiler" ||
    name === "spoiler_block" ||
    name === "quote"
  ) {
    return { name, attr };
  }
  return null;
}

function findClosingTag(text: string, name: string, from: number): number {
  const openPrefix = `[${name}`;
  const closeTag = `[/${name}]`;
  let depth = 1;
  let i = from;

  while (i < text.length) {
    const nextOpen = text.indexOf(openPrefix, i);
    const nextClose = text.indexOf(closeTag, i);
    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const endBracket = text.indexOf("]", nextOpen);
      if (endBracket !== -1) {
        const tagContent = text.slice(nextOpen + 1, endBracket);
        if (tagContent === name || tagContent.startsWith(`${name}=`)) {
          depth += 1;
        }
      }
      i = nextOpen + openPrefix.length;
      continue;
    }

    depth -= 1;
    if (depth === 0) return nextClose;
    i = nextClose + closeTag.length;
  }

  return -1;
}

function pushText(
  nodes: ReactNode[],
  text: string,
  keyPrefix: string,
  keyRef: { n: number },
  options: BbcodeParseOptions,
) {
  if (!text) return;

  const smileyRe = new RegExp(SHIKIMORI_SMILEY_RE.source, SHIKIMORI_SMILEY_RE.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = smileyRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    pushLinkifiedPlainText(nodes, before, keyPrefix, keyRef, options);

    const name = match[1];
    const token = shikimoriSmileyToken(name);
    nodes.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${keyPrefix}sm${keyRef.n++}`}
        src={shikimoriSiteUrl(shikimoriSmileyImageUrl(token))}
        alt={token}
        title={token}
        loading="lazy"
        decoding="async"
        {...EXTERNAL_IMG_ATTRS}
        className="mx-0.5 inline h-5 w-5 align-text-bottom"
      />,
    );

    lastIndex = match.index + match[0].length;
  }

  pushLinkifiedPlainText(nodes, text.slice(lastIndex), keyPrefix, keyRef, options);
}

function renderUrlLink(
  rawHref: string,
  label: ReactNode,
  key: string,
  options: BbcodeParseOptions,
): ReactNode {
  const href = safeHref(rawHref);
  if (!href) return <Fragment key={key}>{label}</Fragment>;

  const linkClassName = "text-accent underline-offset-2 hover:underline break-all";
  const entity = parseShikimoriEntityUrl(href);
  const localAnimeId = parseLocalAnimeUrl(href);

  if (options.enableEntityHover !== false) {
    if (entity?.kind === "anime") {
      return (
        <BbcodeInlineAnimeLink key={key} shikimoriId={entity.id} className={linkClassName}>
          {label}
        </BbcodeInlineAnimeLink>
      );
    }
    if (entity?.kind === "character") {
      return (
        <BbcodeInlineCharacterLink
          key={key}
          characterId={entity.id}
          profileUrl={entity.href}
          className={linkClassName}
        >
          {label}
        </BbcodeInlineCharacterLink>
      );
    }
    if (localAnimeId) {
      return (
        <BbcodeInlineAnimeLink key={key} shikimoriId={localAnimeId} className={linkClassName}>
          {label}
        </BbcodeInlineAnimeLink>
      );
    }
  }

  if (entity?.kind === "anime" || localAnimeId) {
    const animeId = entity?.kind === "anime" ? entity.id : localAnimeId!;
    return (
      <AnimeLink key={key} href={`/anime/${animeId}`} className={linkClassName}>
        {label}
      </AnimeLink>
    );
  }

  if (entity?.kind === "character") {
    return (
      <a key={key} href={entity.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {label}
      </a>
    );
  }

  const person = parseShikimoriPeopleUrl(href);
  if (person) {
    return (
      <a key={key} href={person.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {label}
      </a>
    );
  }

  return (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {label}
    </a>
  );
}

function pushLinkifiedSegment(
  nodes: ReactNode[],
  text: string,
  keyPrefix: string,
  keyRef: { n: number },
  options: BbcodeParseOptions,
) {
  if (!text) return;

  const urlRe = new RegExp(AUTOLINK_URL_RE.source, AUTOLINK_URL_RE.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      nodes.push(<Fragment key={`${keyPrefix}t${keyRef.n++}`}>{before}</Fragment>);
    }

    const { href, trailing } = trimAutolinkUrl(match[0]);
    nodes.push(
      renderUrlLink(href, autolinkUrlLabel(href), `${keyPrefix}url${keyRef.n++}`, options),
    );

    if (trailing) {
      nodes.push(<Fragment key={`${keyPrefix}t${keyRef.n++}`}>{trailing}</Fragment>);
    }

    lastIndex = match.index + match[0].length;
  }

  const rest = text.slice(lastIndex);
  if (rest) {
    nodes.push(<Fragment key={`${keyPrefix}t${keyRef.n++}`}>{rest}</Fragment>);
  }
}

function pushLinkifiedPlainText(
  nodes: ReactNode[],
  text: string,
  keyPrefix: string,
  keyRef: { n: number },
  options: BbcodeParseOptions,
) {
  if (!text) return;
  const parts = text.split("\n");
  parts.forEach((part, index) => {
    if (part) {
      pushLinkifiedSegment(nodes, part, keyPrefix, keyRef, options);
    }
    if (index < parts.length - 1) {
      nodes.push(<br key={`${keyPrefix}br${keyRef.n++}`} />);
    }
  });
}

function entityLinkLabel(attr: string | undefined, children: ReactNode[]): ReactNode {
  if (children.length > 0) return children;
  const slug = parseShikimoriEntityAttr(attr)?.slug;
  return slug ?? null;
}

function wrapTag(
  name: string,
  attr: string | undefined,
  children: ReactNode[],
  key: string,
  options: BbcodeParseOptions,
): ReactNode {
  const linkClassName = "text-accent underline-offset-2 hover:underline";

  switch (name) {
    case "url": {
      const href = safeHref(attr ?? "");
      const label = children.length > 0 ? children : attr;
      if (!href) return <Fragment key={key}>{label}</Fragment>;
      return renderUrlLink(href, label, key, options);
    }
    case "character": {
      const id = parseShikimoriEntityId(attr);
      const label = entityLinkLabel(attr, children);
      if (!id || label == null) return <Fragment key={key}>{label ?? children}</Fragment>;

      const profileUrl = shikimoriSiteUrl(`/characters/${id}`);
      if (options.enableEntityHover) {
        return (
          <BbcodeInlineCharacterLink
            key={key}
            characterId={Number(id)}
            profileUrl={profileUrl}
            className={linkClassName}
          >
            {label}
          </BbcodeInlineCharacterLink>
        );
      }

      return (
        <a key={key} href={profileUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          {label}
        </a>
      );
    }
    case "anime": {
      const id = parseShikimoriEntityId(attr);
      const label = entityLinkLabel(attr, children);
      if (!id || label == null) return <Fragment key={key}>{label ?? children}</Fragment>;

      if (options.enableEntityHover) {
        return (
          <BbcodeInlineAnimeLink key={key} shikimoriId={Number(id)} className={linkClassName}>
            {label}
          </BbcodeInlineAnimeLink>
        );
      }

      return (
        <AnimeLink key={key} href={`/anime/${id}`} className={linkClassName}>
          {label}
        </AnimeLink>
      );
    }
    case "manga": {
      const id = parseShikimoriEntityId(attr);
      const label = entityLinkLabel(attr, children);
      if (!id || label == null) return <Fragment key={key}>{label ?? children}</Fragment>;
      return (
        <a
          key={key}
          href={shikimoriSiteUrl(`/mangas/${id}`)}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {label}
        </a>
      );
    }
    case "person": {
      const id = parseShikimoriEntityId(attr);
      const label = entityLinkLabel(attr, children);
      if (!id || label == null) return <Fragment key={key}>{label ?? children}</Fragment>;
      return (
        <a
          key={key}
          href={shikimoriSiteUrl(`/people/${id}`)}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {label}
        </a>
      );
    }
    case "quote": {
      const meta = parseQuoteAttr(attr);
      return (
        <BbcodeQuoteBlock key={key} meta={meta}>
          {children}
        </BbcodeQuoteBlock>
      );
    }
    case "spoiler":
      return (
        <BbcodeInlineSpoiler key={key} label={attr}>
          {children}
        </BbcodeInlineSpoiler>
      );
    case "spoiler_block":
      return (
        <BbcodeSpoilerBlock key={key} label={attr}>
          {children}
        </BbcodeSpoilerBlock>
      );
    case "center":
      return (
        <div key={key} className="my-1.5 block text-center">
          {children}
        </div>
      );
    case "color": {
      const colorKey = attr?.trim().toLowerCase() ?? "";
      const colorClass = COLOR_CLASS[colorKey] ?? "text-foreground";
      return (
        <span key={key} className={colorClass}>
          {children}
        </span>
      );
    }
    case "poster": {
      const urlAttr = attr?.trim();
      if (urlAttr && /^\d+$/.test(urlAttr)) {
        return (
          <BbcodeShikimoriImage
            key={key}
            imageId={urlAttr}
            src={options.images?.[urlAttr] ?? null}
            className="my-2 block w-full max-w-md"
          />
        );
      }
      const innerUrl = typeof children[0] === "string" ? children[0] : null;
      const href = safeHref(innerUrl ?? urlAttr ?? "");
      if (!href) return <Fragment key={key}>{children}</Fragment>;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={href}
          alt=""
          loading="lazy"
          decoding="async"
          {...EXTERNAL_IMG_ATTRS}
          className="my-2 block w-full max-w-md rounded-md border border-border/60 object-contain"
        />
      );
    }
    case "img": {
      const innerUrl = typeof children[0] === "string" ? children[0] : null;
      const href = safeHref(innerUrl ?? "");
      const size = parseShikimoriImageSizeAttrs(attr);
      if (!href) return <Fragment key={key}>{children}</Fragment>;
      const style =
        size.width || size.height
          ? {
              width: size.width ? `${size.width}px` : undefined,
              height: size.height ? `${size.height}px` : undefined,
              maxWidth: "100%",
            }
          : undefined;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={href}
          alt=""
          loading="lazy"
          decoding="async"
          style={style}
          {...EXTERNAL_IMG_ATTRS}
          className="my-1 inline-block max-w-full rounded-md border border-border/60 object-contain"
        />
      );
    }
    case "b":
      return (
        <strong key={key} className="font-semibold text-foreground">
          {children}
        </strong>
      );
    case "i":
      return <em key={key}>{children}</em>;
    case "u":
      return <u key={key}>{children}</u>;
    case "s":
      return <s key={key}>{children}</s>;
    case "replies": {
      const ids = parseShikimoriRepliesIds(attr);
      if (ids.length === 0) return null;

      return (
        <Fragment key={key}>
          {ids.map((id) => {
            if (options.nested) {
              return <BbcodeReplyFallback key={id} id={id} />;
            }

            const reply = options.replies?.[id];
            if (reply) {
              return (
                <BbcodeReplyQuote
                  key={id}
                  reply={reply}
                  replies={options.replies}
                  images={options.images}
                  enableEntityHover={options.enableEntityHover}
                />
              );
            }

            return <BbcodeReplyFallback key={id} id={id} />;
          })}
        </Fragment>
      );
    }
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

function parseInline(text: string, keyPrefix: string, options: BbcodeParseOptions): ReactNode[] {
  const result: ReactNode[] = [];
  const keyRef = { n: 0 };
  let i = 0;

  while (i < text.length) {
    const open = text.indexOf("[", i);
    if (open === -1) {
      pushText(result, text.slice(i), keyPrefix, keyRef, options);
      break;
    }

    pushText(result, text.slice(i, open), keyPrefix, keyRef, options);

    if (text.startsWith("[br]", open) || text.startsWith("[br/]", open) || text.startsWith("[br /]", open)) {
      const len = text.startsWith("[br]", open) ? 4 : text.startsWith("[br/]", open) ? 5 : 6;
      result.push(<br key={`${keyPrefix}br${keyRef.n++}`} />);
      i = open + len;
      continue;
    }

    const tail = text.slice(open);
    const banMatch = tail.match(/^\[ban=\d+]/i);
    if (banMatch) {
      i = open + banMatch[0].length;
      continue;
    }

    const imageMatch = tail.match(/^\[image=(\d+)([^\]]*)]/i);
    if (imageMatch) {
      const id = imageMatch[1];
      result.push(
        <BbcodeShikimoriImage
          key={`${keyPrefix}image${keyRef.n++}`}
          imageId={id}
          src={options.images?.[id] ?? null}
          size={parseShikimoriImageSizeAttrs(imageMatch[2])}
        />,
      );
      i = open + imageMatch[0].length;
      continue;
    }

    const posterVoidMatch = tail.match(/^\[poster=(\d+)([^\]]*)]/i);
    if (posterVoidMatch) {
      const id = posterVoidMatch[1];
      result.push(
        <BbcodeShikimoriImage
          key={`${keyPrefix}poster${keyRef.n++}`}
          imageId={id}
          src={options.images?.[id] ?? null}
          className="my-2 block w-full max-w-md"
        />,
      );
      i = open + posterVoidMatch[0].length;
      continue;
    }

    const closeBracket = text.indexOf("]", open);
    if (closeBracket === -1) {
      pushText(result, text.slice(open), keyPrefix, keyRef, options);
      break;
    }

    const tagRaw = text.slice(open + 1, closeBracket);
    if (tagRaw.startsWith("/")) {
      pushText(result, text.slice(open, closeBracket + 1), keyPrefix, keyRef, options);
      i = closeBracket + 1;
      continue;
    }

    const parsed = parseTagOpen(tagRaw);
    if (!parsed) {
      pushText(result, text.slice(open, closeBracket + 1), keyPrefix, keyRef, options);
      i = closeBracket + 1;
      continue;
    }

    if (VOID_TAGS.has(parsed.name)) {
      result.push(wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`, options));
      i = closeBracket + 1;
      continue;
    }

    const closeTag = `[/${parsed.name}]`;
    const innerStart = closeBracket + 1;

    if (parsed.name === "url" && !tagRaw.includes("=")) {
      const closeIdx = text.indexOf(closeTag, innerStart);
      if (closeIdx === -1) {
        pushText(result, text.slice(open), keyPrefix, keyRef, options);
        break;
      }
      const inner = text.slice(innerStart, closeIdx).trim();
      result.push(renderUrlLink(inner, inner, `${keyPrefix}url${keyRef.n++}`, options));
      i = closeIdx + closeTag.length;
      continue;
    }

    if (parsed.name === "img") {
      const closeIdx = text.indexOf(closeTag, innerStart);
      if (closeIdx === -1) {
        pushText(result, text.slice(open), keyPrefix, keyRef, options);
        break;
      }
      const inner = text.slice(innerStart, closeIdx).trim();
      const size = parseShikimoriImageSizeAttrs(parsed.attr);
      const href = safeHref(inner);
      result.push(
        href ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${keyPrefix}img${keyRef.n++}`}
            src={href}
            alt=""
            loading="lazy"
            decoding="async"
            style={
              size.width || size.height
                ? {
                    width: size.width ? `${size.width}px` : undefined,
                    height: size.height ? `${size.height}px` : undefined,
                    maxWidth: "100%",
                  }
                : undefined
            }
            {...EXTERNAL_IMG_ATTRS}
            className="my-1 inline-block max-w-full rounded-md border border-border/60 object-contain"
          />
        ) : (
          <Fragment key={`${keyPrefix}img${keyRef.n++}`}>{inner}</Fragment>
        ),
      );
      i = closeIdx + closeTag.length;
      continue;
    }

    if (parsed.name === "poster" && !parsed.attr) {
      const closeIdx = text.indexOf(closeTag, innerStart);
      if (closeIdx === -1) {
        pushText(result, text.slice(open), keyPrefix, keyRef, options);
        break;
      }
      const inner = text.slice(innerStart, closeIdx).trim();
      const href = safeHref(inner);
      result.push(
        href ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${keyPrefix}poster${keyRef.n++}`}
            src={href}
            alt=""
            loading="lazy"
            decoding="async"
            {...EXTERNAL_IMG_ATTRS}
            className="my-2 block w-full max-w-md rounded-md border border-border/60 object-contain"
          />
        ) : (
          <Fragment key={`${keyPrefix}poster${keyRef.n++}`}>{inner}</Fragment>
        ),
      );
      i = closeIdx + closeTag.length;
      continue;
    }

    if (ENTITY_TAGS.has(parsed.name)) {
      if (text.startsWith(closeTag, innerStart)) {
        result.push(
          wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`, options),
        );
        i = innerStart + closeTag.length;
        continue;
      }

      const nextChar = text[innerStart];
      const isVoidTag = nextChar === undefined || /\s/.test(nextChar);

      if (isVoidTag) {
        result.push(
          wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`, options),
        );
        i = innerStart;
        continue;
      }

      const closeIdx = findClosingTag(text, parsed.name, innerStart);
      if (closeIdx === -1) {
        result.push(
          wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`, options),
        );
        i = innerStart;
        continue;
      }

      const innerText = text.slice(innerStart, closeIdx);
      const children = parseInline(innerText, `${keyPrefix}${parsed.name}${keyRef.n}-`, options);
      result.push(wrapTag(parsed.name, parsed.attr, children, `${keyPrefix}${parsed.name}${keyRef.n++}`, options));
      i = closeIdx + closeTag.length;
      continue;
    }

    const closeIdx = findClosingTag(text, parsed.name, innerStart);
    if (closeIdx === -1) {
      pushText(result, text.slice(open), keyPrefix, keyRef, options);
      break;
    }

    const innerText = text.slice(innerStart, closeIdx);
    const children = parseInline(innerText, `${keyPrefix}${parsed.name}${keyRef.n}-`, options);
    result.push(wrapTag(parsed.name, parsed.attr, children, `${keyPrefix}${parsed.name}${keyRef.n++}`, options));
    i = closeIdx + closeTag.length;
  }

  return result;
}

/** Убирает BBCode для plain-text (meta, превью). */
export { stripShikimoriBbcode } from "@/lib/shikimori-bbcode";

export function parseShikimoriBbcode(text: string, options: BbcodeParseOptions = {}): ReactNode[] {
  return parseInline(preprocessShikimoriCommentText(text), "", options);
}

type FormattedDescriptionProps = {
  text: string;
  className?: string;
  paragraphClassName?: string;
  replies?: Record<string, CommentReplyDto>;
  images?: Record<string, string>;
  enableEntityHover?: boolean;
};

export function FormattedDescription({
  text,
  className = "",
  paragraphClassName = "",
  replies,
  images,
  enableEntityHover = true,
}: FormattedDescriptionProps) {
  const paragraphs = preprocessShikimoriCommentText(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  const parseOptions: BbcodeParseOptions = { replies, images, enableEntityHover };

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <div key={index} className={[paragraphClassName, index > 0 ? "mt-3" : ""].filter(Boolean).join(" ")}>
          {parseShikimoriBbcode(paragraph, parseOptions)}
        </div>
      ))}
    </div>
  );
}
