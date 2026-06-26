/** Убирает BBCode Shikimori для plain-text (meta, превью). */
export function stripShikimoriBbcode(text: string): string {
  return text
    .replace(/\[br\s*\/?\]/gi, " ")
    .replace(/\[(?:url|character|anime|manga)(?:=[^\]]*)?]([\s\S]*?)\[\/(?:url|character|anime|manga)]/gi, "$1")
    .replace(/\[(?:character|anime|manga)=(\d+)(?:\s+([^\]]*))?\]/gi, (_, _id, slug) => slug?.trim() || "")
    .replace(/\[(?:b|i|u|s)]([\s\S]*?)\[\/(?:b|i|u|s)]/gi, "$1")
    .replace(/\[[^\]]*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
