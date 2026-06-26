const WORLDART_USER_AGENT = "TrackAnime";

export type WorldArtSection = "animation" | "cinema";

export type ParsedWorldArtLink = {
  section: WorldArtSection;
  id: number;
};

export function parseWorldArtLink(link: string): ParsedWorldArtLink | null {
  try {
    const url = new URL(link.trim());
    if (!url.hostname.includes("world-art.ru")) return null;

    const sectionMatch = url.pathname.match(/^\/(animation|cinema)\//i);
    const id = Number(url.searchParams.get("id"));
    if (!sectionMatch || !Number.isInteger(id) || id <= 0) return null;

    return {
      section: sectionMatch[1]!.toLowerCase() as WorldArtSection,
      id,
    };
  } catch {
    return null;
  }
}

export function buildWorldArtPosterUrl(section: WorldArtSection, id: number): string {
  const bucket = Math.floor(id / 1000) * 1000 + 1000;
  return `http://www.world-art.ru/${section}/img/${bucket}/${id}/1.jpg`;
}

export function extractWorldArtPosterFromHtml(html: string, section: WorldArtSection): string | null {
  const pattern = new RegExp(
    String.raw`https?://(?:www\.)?world-art\.ru/${section}/img/\d+/\d+/1\.jpg`,
    "i",
  );
  const match = html.match(pattern);
  return match?.[0] ?? null;
}

export async function fetchWorldArtPoster(link: string): Promise<string | null> {
  const parsed = parseWorldArtLink(link);
  if (!parsed) return null;

  const fallback = buildWorldArtPosterUrl(parsed.section, parsed.id);

  try {
    const res = await fetch(link, {
      headers: { "User-Agent": WORLDART_USER_AGENT },
      next: { revalidate: 86_400 },
    });
    if (res.ok) {
      const html = await res.text();
      const scraped = extractWorldArtPosterFromHtml(html, parsed.section);
      if (scraped) return scraped;
    }
  } catch {
    /* ignore network errors */
  }

  return fallback;
}
