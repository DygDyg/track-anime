import { buildCachedImageUrl } from "@/lib/image-cache-url";
import { parseScreenshotUrls, uniqueScreenshotUrls } from "@/lib/screenshots";
import { isAllowedTaPlusTileUrl, taPlusProxiedTileUrl } from "@/lib/ta-plus-tile-proxy";
import { sortTaPlusQualityKeys } from "@/lib/ta-plus-master-playlist";
import type { TaPlusTiles } from "@/lib/ta-plus-tiles";
import { resolveTaPlusTilePreview } from "@/lib/ta-plus-tiles";

/** Build Kodik CDN thumb001…thumb005 candidates from a signed stream/tiles URL. */
export function deriveSolodThumbUrls(fromUrl: string | null | undefined): string[] {
  if (!fromUrl?.trim()) return [];
  try {
    const url = new URL(fromUrl.trim().replace(/^\/\//, "https://"));
    const match = url.pathname.match(/^(.*:\d{8,})(?:\/|$)/);
    if (!match?.[1]) return [];

    const bases = new Set<string>([match[1]]);
    // `.../tiles/hash:ts/...` → also try parent without `/tiles`
    const withoutTilesDir = match[1].replace(/\/tiles(?=\/[^/]+:\d{8,}$)/i, "");
    if (withoutTilesDir !== match[1]) bases.add(withoutTilesDir);

    const out: string[] = [];
    for (const basePath of bases) {
      for (let i = 1; i <= 5; i += 1) {
        const name = `thumb${String(i).padStart(3, "0")}.jpg`;
        out.push(`${url.origin}${basePath}/${name}`);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function readMaterialDataScreenshots(materialData: unknown): string[] {
  if (!materialData || typeof materialData !== "object") return [];
  return parseScreenshotUrls((materialData as { screenshots?: unknown }).screenshots);
}

/**
 * Full-frame idle previews (not sprite sheets).
 * Prefer episode screenshots from DB, then Kodik CDN thumbs derived from stream URL.
 */
export function buildTaPlusPreviewUrls(input: {
  tiles: TaPlusTiles | null;
  qualities: Record<string, string>;
  episodeScreenshots?: unknown;
  materialData?: unknown;
}): string[] {
  const fromDb = uniqueScreenshotUrls([
    ...parseScreenshotUrls(input.episodeScreenshots),
    ...readMaterialDataScreenshots(input.materialData),
  ]);

  const qualityKeys = sortTaPlusQualityKeys(input.qualities);
  const bestQualityUrl = qualityKeys[0] ? input.qualities[qualityKeys[0]!] ?? null : null;
  const fromThumbs = uniqueScreenshotUrls([
    ...deriveSolodThumbUrls(bestQualityUrl),
    ...deriveSolodThumbUrls(input.tiles?.pattern),
  ]);

  return uniqueScreenshotUrls([...fromDb, ...fromThumbs]).slice(0, 5);
}

/** Browser-safe display URL (CDN → /api/taplus-tile, else image-cache). */
export function toTaPlusDisplayPreviewUrl(url: string): string {
  if (url.startsWith("/api/")) return url;
  if (isAllowedTaPlusTileUrl(url)) return taPlusProxiedTileUrl(url);
  return buildCachedImageUrl("screenshot", url) ?? url;
}

export function buildTaPlusScrubPreviewUrl(
  tiles: TaPlusTiles | null,
  positionSeconds: number,
): string | null {
  if (!tiles) return null;
  return resolveTaPlusTilePreview(tiles, positionSeconds, { proxied: true })?.url ?? null;
}
