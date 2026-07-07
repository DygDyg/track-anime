/** Качества потока в хвосте ссылки Kodik player (…/720p) */
export const KODIK_STREAM_QUALITIES = ["360p", "480p", "720p", "1080p", "1080p Ultra"] as const;

export type KodikStreamQuality = (typeof KODIK_STREAM_QUALITIES)[number];

const STREAM_QUALITY_SET = new Set<string>(KODIK_STREAM_QUALITIES);

function toAbsolutePlayerUrl(link: string): string {
  return link.startsWith("//") ? `https:${link}` : link;
}

function looksLikeStreamQuality(segment: string): boolean {
  if (STREAM_QUALITY_SET.has(segment)) return true;
  if (/^\d+p$/i.test(segment)) return true;
  return segment.toLowerCase().includes("1080p");
}

export function isKodikStreamQuality(value: string): value is KodikStreamQuality {
  return STREAM_QUALITY_SET.has(value);
}

export function parseStreamQualityFromPlayerLink(link: string): string | null {
  try {
    const url = new URL(toAbsolutePlayerUrl(link.trim()));
    const segments = url.pathname.split("/").filter(Boolean);
    const tail = decodeURIComponent(segments[segments.length - 1] ?? "");
    if (!tail) return null;
    if (looksLikeStreamQuality(tail)) return tail;
    return null;
  } catch {
    const trimmed = link.trim().replace(/\/$/, "");
    const tail = decodeURIComponent(trimmed.slice(trimmed.lastIndexOf("/") + 1));
    if (!tail) return null;
    return looksLikeStreamQuality(tail) ? tail : null;
  }
}

export function replaceStreamQualityInPlayerLink(link: string, quality: string): string {
  const protocolRelative = link.startsWith("//");
  const absolute = toAbsolutePlayerUrl(link.trim());
  const url = new URL(absolute);
  const segments = url.pathname.split("/").filter(Boolean);
  const encodedQuality = encodeURIComponent(quality);

  if (segments.length > 0) {
    const last = decodeURIComponent(segments[segments.length - 1] ?? "");
    if (looksLikeStreamQuality(last)) {
      segments[segments.length - 1] = encodedQuality;
    } else {
      segments.push(encodedQuality);
    }
  } else {
    segments.push(encodedQuality);
  }

  url.pathname = `/${segments.join("/")}`;
  const result = url.toString();
  if (protocolRelative) {
    return result.replace(/^https:/, "");
  }
  return result;
}

export function listKodikStreamQualities(playerLink: string | null): KodikStreamQuality[] {
  if (!playerLink) return [...KODIK_STREAM_QUALITIES];
  return [...KODIK_STREAM_QUALITIES];
}
