import { normalizeKodikGenreKey } from "@/lib/kodik-material-meta";

const OCEAN_API = "https://hentaiocean.com/api";
const OCEAN_EMBED_BASE = "https://hentaiocean.com/embed";
const HENTAI_GENRE_KEYS = new Set(["хентай", "hentai"]);

/** shikimoriId → embed URL or null (miss). */
const slugCache = new Map<number, string | null>();

export function isHentaiAnime(input: {
  rating?: string | null;
  genres?: Array<{ name?: string | null } | string> | null;
}): boolean {
  if (String(input.rating ?? "").toLowerCase() === "rx") return true;
  for (const g of input.genres ?? []) {
    const name = typeof g === "string" ? g : g?.name;
    if (!name) continue;
    if (HENTAI_GENRE_KEYS.has(normalizeKodikGenreKey(name))) return true;
  }
  return false;
}

export function slugifyHentaiOceanTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[♥♡★☆♪♫]/g, "")
    .replace(/\s+the animation\b/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function candidateSlugs(titles: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    const base = slugifyHentaiOceanTitle(trimmed);
    if (!base) continue;
    for (const c of [base, `${base}-1`, base.replace(/-+$/, "")]) {
      if (!c || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }
  return out.slice(0, 12);
}

async function probeOceanSlug(slug: string, signal?: AbortSignal): Promise<boolean> {
  const url = `${OCEAN_API}?action=hentai&slug=${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json", "User-Agent": "TrackAnime/1.0" },
      // slug presence changes rarely; cache within the request lifecycle via slugCache
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { info?: unknown[] };
    return Array.isArray(data.info) && data.info.length > 0;
  } catch {
    return false;
  }
}

export function buildHentaiOceanEmbedUrl(slug: string): string {
  return `${OCEAN_EMBED_BASE}/${encodeURIComponent(slug)}?la=1`;
}

/**
 * Resolve Hentai Ocean embed URL by title candidates. Cached per shikimoriId in-process.
 * Returns null when nothing matches.
 */
export async function resolveHentaiOceanEmbedUrl(input: {
  shikimoriId: number;
  titles: string[];
  signal?: AbortSignal;
}): Promise<string | null> {
  if (slugCache.has(input.shikimoriId)) {
    return slugCache.get(input.shikimoriId) ?? null;
  }

  const candidates = candidateSlugs(input.titles);
  for (const slug of candidates) {
    const ok = await probeOceanSlug(slug, input.signal);
    if (ok) {
      const embed = buildHentaiOceanEmbedUrl(slug);
      slugCache.set(input.shikimoriId, embed);
      return embed;
    }
  }

  slugCache.set(input.shikimoriId, null);
  return null;
}
