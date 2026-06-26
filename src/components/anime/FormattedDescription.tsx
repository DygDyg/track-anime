import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { AnimeLink } from "@/components/AnimeLink";
import { parseShikimoriEntityAttr, parseShikimoriEntityId } from "@/lib/shikimori-bbcode";

const ALLOWED_SIMPLE_TAGS = new Set(["b", "i", "u", "s"]);
const ENTITY_TAGS = new Set(["character", "anime", "manga"]);

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
  const eq = raw.indexOf("=");
  if (eq === -1) {
    const name = raw.toLowerCase();
    return ALLOWED_SIMPLE_TAGS.has(name) || name === "url" ? { name } : null;
  }

  const name = raw.slice(0, eq).toLowerCase();
  const attr = raw.slice(eq + 1);
  if (name === "url" || name === "character" || name === "anime" || name === "manga") {
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

function pushText(nodes: ReactNode[], text: string, keyPrefix: string, keyRef: { n: number }) {
  if (!text) return;
  const parts = text.split("\n");
  parts.forEach((part, index) => {
    if (part) {
      nodes.push(<Fragment key={`${keyPrefix}t${keyRef.n++}`}>{part}</Fragment>);
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
): ReactNode {
  switch (name) {
    case "url": {
      const href = safeHref(attr ?? "");
      const label = children.length > 0 ? children : attr;
      if (!href) return <Fragment key={key}>{label}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {label}
        </a>
      );
    }
    case "character": {
      const id = parseShikimoriEntityId(attr);
      const label = entityLinkLabel(attr, children);
      if (!id || label == null) return <Fragment key={key}>{label ?? children}</Fragment>;
      return (
        <a
          key={key}
          href={`https://shikimori.one/characters/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {label}
        </a>
      );
    }
    case "anime": {
      const id = parseShikimoriEntityId(attr);
      const label = entityLinkLabel(attr, children);
      if (!id || label == null) return <Fragment key={key}>{label ?? children}</Fragment>;
      return (
        <AnimeLink key={key} href={`/anime/${id}`} className="text-accent underline-offset-2 hover:underline">
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
          href={`https://shikimori.one/mangas/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {label}
        </a>
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
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

function parseInline(text: string, keyPrefix = ""): ReactNode[] {
  const result: ReactNode[] = [];
  const keyRef = { n: 0 };
  let i = 0;

  while (i < text.length) {
    const open = text.indexOf("[", i);
    if (open === -1) {
      pushText(result, text.slice(i), keyPrefix, keyRef);
      break;
    }

    pushText(result, text.slice(i, open), keyPrefix, keyRef);

    if (text.startsWith("[br]", open) || text.startsWith("[br/]", open) || text.startsWith("[br /]", open)) {
      const len = text.startsWith("[br]", open) ? 4 : text.startsWith("[br/]", open) ? 5 : 6;
      result.push(<br key={`${keyPrefix}br${keyRef.n++}`} />);
      i = open + len;
      continue;
    }

    const closeBracket = text.indexOf("]", open);
    if (closeBracket === -1) {
      pushText(result, text.slice(open), keyPrefix, keyRef);
      break;
    }

    const tagRaw = text.slice(open + 1, closeBracket);
    if (tagRaw.startsWith("/")) {
      pushText(result, text.slice(open, closeBracket + 1), keyPrefix, keyRef);
      i = closeBracket + 1;
      continue;
    }

    const parsed = parseTagOpen(tagRaw);
    if (!parsed) {
      pushText(result, text.slice(open, closeBracket + 1), keyPrefix, keyRef);
      i = closeBracket + 1;
      continue;
    }

    const closeTag = `[/${parsed.name}]`;
    const innerStart = closeBracket + 1;

    if (parsed.name === "url" && !tagRaw.includes("=")) {
      const closeIdx = text.indexOf(closeTag, innerStart);
      if (closeIdx === -1) {
        pushText(result, text.slice(open), keyPrefix, keyRef);
        break;
      }
      const inner = text.slice(innerStart, closeIdx).trim();
      const href = safeHref(inner);
      result.push(
        href ? (
          <a
            key={`${keyPrefix}url${keyRef.n++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            {inner}
          </a>
        ) : (
          <Fragment key={`${keyPrefix}url${keyRef.n++}`}>{inner}</Fragment>
        ),
      );
      i = closeIdx + closeTag.length;
      continue;
    }

    if (ENTITY_TAGS.has(parsed.name)) {
      if (text.startsWith(closeTag, innerStart)) {
        result.push(
          wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`),
        );
        i = innerStart + closeTag.length;
        continue;
      }

      const nextChar = text[innerStart];
      const isVoidTag = nextChar === undefined || /\s/.test(nextChar);

      if (isVoidTag) {
        result.push(
          wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`),
        );
        i = innerStart;
        continue;
      }

      const closeIdx = findClosingTag(text, parsed.name, innerStart);
      if (closeIdx === -1) {
        result.push(
          wrapTag(parsed.name, parsed.attr, [], `${keyPrefix}${parsed.name}${keyRef.n++}`),
        );
        i = innerStart;
        continue;
      }

      const innerText = text.slice(innerStart, closeIdx);
      const children = parseInline(innerText, `${keyPrefix}${parsed.name}${keyRef.n}-`);
      result.push(wrapTag(parsed.name, parsed.attr, children, `${keyPrefix}${parsed.name}${keyRef.n++}`));
      i = closeIdx + closeTag.length;
      continue;
    }

    const closeIdx = findClosingTag(text, parsed.name, innerStart);
    if (closeIdx === -1) {
      pushText(result, text.slice(open), keyPrefix, keyRef);
      break;
    }

    const innerText = text.slice(innerStart, closeIdx);
    const children = parseInline(innerText, `${keyPrefix}${parsed.name}${keyRef.n}-`);
    result.push(wrapTag(parsed.name, parsed.attr, children, `${keyPrefix}${parsed.name}${keyRef.n++}`));
    i = closeIdx + closeTag.length;
  }

  return result;
}

/** Убирает BBCode для plain-text (meta, превью). */
export { stripShikimoriBbcode } from "@/lib/shikimori-bbcode";

export function parseShikimoriBbcode(text: string): ReactNode[] {
  return parseInline(text);
}

type FormattedDescriptionProps = {
  text: string;
  className?: string;
  paragraphClassName?: string;
};

export function FormattedDescription({
  text,
  className = "",
  paragraphClassName = "",
}: FormattedDescriptionProps) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={[paragraphClassName, index > 0 ? "mt-3" : ""].filter(Boolean).join(" ")}>
          {parseShikimoriBbcode(paragraph)}
        </p>
      ))}
    </div>
  );
}
