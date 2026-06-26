import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { CoverCacheRuntimeSettings } from "@/lib/admin/cover-cache-settings";
import { kodikSearch } from "@/kodik/client";
import { discoverPosterCandidates, type PosterFallbackSource } from "@/lib/poster-fallback";
import { isShikimoriMissingImage } from "@/lib/shikimori/client";

export const DEFAULT_COVER_QUALITY = 70;
export const DEFAULT_COVER_MAX_HEIGHT = 450;
export const DEFAULT_COVER_THUMB_MAX_WIDTH = 256;
export const DEFAULT_COVER_THUMB_QUALITY = 62;
export const DEFAULT_COVER_BROWSER_CACHE_SEC = 60 * 60 * 24 * 7;

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type CoverFetchSource = "cache" | PosterFallbackSource | "worldart" | "none";

export type CoverFetchResult = {
  filePath: string;
  source: CoverFetchSource;
  cached: boolean;
  buffer?: Buffer;
};

export function getCoverCacheDir(): string {
  const override = process.env.COVER_CACHE_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "cover-cache");
}

export function coverCacheFileForId(shikimoriId: number): string {
  return path.join(getCoverCacheDir(), `${shikimoriId}.webp`);
}

export function coverCacheThumbFileForId(shikimoriId: number): string {
  return path.join(getCoverCacheDir(), `${shikimoriId}.thumb.webp`);
}

export async function ensureCoverCacheDir(): Promise<void> {
  await fsPromises.mkdir(getCoverCacheDir(), { recursive: true });
}

function resolveAbsoluteUrl(baseUrl: string, relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

function getCacheState(
  destPath: string,
  maxAgeDays: number,
): "fresh" | "stale" | "missing" {
  if (!fs.existsSync(destPath)) return "missing";
  if (maxAgeDays <= 0) return "fresh";
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (Date.now() - fs.statSync(destPath).mtimeMs > maxAgeMs) return "stale";
  return "fresh";
}

async function fetchImageBuffer(url: string, referer?: string): Promise<Buffer | null> {
  let origin = "";
  try {
    origin = `${new URL(url).origin}/`;
  } catch {
    /* ignore invalid url */
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": FETCH_UA,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(referer || origin ? { Referer: referer ?? origin } : {}),
    },
    redirect: "follow",
  });

  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return null;
  return buf;
}

export async function saveCoverWebp(
  input: Buffer,
  destPath: string,
  settings: Pick<CoverCacheRuntimeSettings, "quality" | "maxHeight">,
): Promise<boolean> {
  try {
    const meta = await sharp(input).metadata();
    let pipeline = sharp(input);
    if (meta.height && meta.height > settings.maxHeight) {
      pipeline = pipeline.resize({
        height: settings.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      });
    }
    await pipeline
      .webp({ quality: settings.quality, smartSubsample: true })
      .toFile(destPath);
    return true;
  } catch {
    return false;
  }
}

function thumbWebpQuality(settings: Pick<CoverCacheRuntimeSettings, "quality">): number {
  return Math.min(settings.quality, DEFAULT_COVER_THUMB_QUALITY);
}

export async function saveCoverThumbFromSource(
  sourcePath: string,
  thumbPath: string,
  settings: Pick<CoverCacheRuntimeSettings, "quality">,
): Promise<boolean> {
  try {
    await sharp(sourcePath)
      .resize({
        width: DEFAULT_COVER_THUMB_MAX_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .webp({ quality: thumbWebpQuality(settings), smartSubsample: true })
      .toFile(thumbPath);
    return true;
  } catch {
    return false;
  }
}

export async function resizeCoverToThumbBuffer(
  input: Buffer | string,
  settings: Pick<CoverCacheRuntimeSettings, "quality">,
): Promise<Buffer | null> {
  try {
    return await sharp(input)
      .resize({
        width: DEFAULT_COVER_THUMB_MAX_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .webp({ quality: thumbWebpQuality(settings), smartSubsample: true })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function ensureCoverThumb(
  shikimoriId: number,
  mainPath: string,
  settings: CoverCacheRuntimeSettings,
): Promise<string | null> {
  if (!fs.existsSync(mainPath)) return null;

  const thumbPath = coverCacheThumbFileForId(shikimoriId);
  if (fs.existsSync(thumbPath)) {
    const mainStat = fs.statSync(mainPath);
    const thumbStat = fs.statSync(thumbPath);
    if (thumbStat.mtimeMs >= mainStat.mtimeMs) {
      return thumbPath;
    }
  }

  const ok = await saveCoverThumbFromSource(mainPath, thumbPath, settings);
  return ok ? thumbPath : null;
}

async function removeCoverThumbIfExists(shikimoriId: number): Promise<void> {
  const thumbPath = coverCacheThumbFileForId(shikimoriId);
  if (fs.existsSync(thumbPath)) {
    await fsPromises.unlink(thumbPath);
  }
}

function parseWorldArtPosterUrl(html: string, pageUrl: string): string | null {
  const patterns = [
    /<tr[^>]*>\s*<td[^>]*>\s*(?:<center>)?\s*<a[^>]*>\s*<img[^>]+src=["']([^"']+)["']/i,
    /<tr[^>]*>\s*<td[^>]*>\s*<a[^>]*>\s*<img[^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']/i,
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) {
      return resolveAbsoluteUrl(pageUrl, match[1]);
    }
  }

  return null;
}

async function tryKodikWorldArt(
  shikimoriId: number,
  destPath: string,
  settings: Pick<CoverCacheRuntimeSettings, "quality" | "maxHeight">,
): Promise<"worldart" | null> {
  try {
    const data = await kodikSearch({
      shikimori_id: shikimoriId,
      with_material_data: true,
      limit: 1,
    });

    const result = data.results[0];
    if (!result) return null;

    const worldArtUrl = result.worldart_link ?? result.material_data?.worldart_link ?? null;
    if (!worldArtUrl) return null;

    const htmlRes = await fetch(worldArtUrl, {
      headers: { "User-Agent": FETCH_UA },
    });
    if (!htmlRes.ok) return null;

    const html = await htmlRes.text();
    const imageUrl = parseWorldArtPosterUrl(html, worldArtUrl);
    if (!imageUrl) return null;

    const buf = await fetchImageBuffer(imageUrl, worldArtUrl);
    if (buf && (await saveCoverWebp(buf, destPath, settings))) {
      return "worldart";
    }
  } catch {
    /* ignore */
  }

  return null;
}

async function downloadCoverFromSources(options: {
  shikimoriId?: number;
  url?: string;
  destPath: string;
  settings: CoverCacheRuntimeSettings;
}): Promise<CoverFetchSource | null> {
  const { shikimoriId, url, destPath, settings } = options;

  if (shikimoriId) {
    const candidates = await discoverPosterCandidates(shikimoriId, url);
    for (const candidate of candidates) {
      const buf = await fetchImageBuffer(candidate.url, candidate.url);
      if (buf && (await saveCoverWebp(buf, destPath, settings))) {
        return candidate.source;
      }
    }

    const worldArt = await tryKodikWorldArt(shikimoriId, destPath, settings);
    if (worldArt) return worldArt;
    return null;
  }

  if (url && !isShikimoriMissingImage(url)) {
    const buf = await fetchImageBuffer(url, url);
    if (buf && (await saveCoverWebp(buf, destPath, settings))) {
      return "url";
    }
  }

  return null;
}

export async function resolveCoverSourceUrl(options: {
  shikimoriId?: number;
  url?: string;
}): Promise<string | null> {
  const { shikimoriId, url } = options;
  if (!shikimoriId) {
    return url && !isShikimoriMissingImage(url) ? url : null;
  }

  const candidates = await discoverPosterCandidates(shikimoriId, url);
  return candidates[0]?.url ?? null;
}

export async function fetchAndCacheCover(options: {
  shikimoriId?: number;
  url?: string;
  force?: boolean;
  settings: CoverCacheRuntimeSettings;
}): Promise<CoverFetchResult | null> {
  const { shikimoriId, url, force = false, settings } = options;
  if (!shikimoriId && !url) return null;

  await ensureCoverCacheDir();

  const destPath = shikimoriId
    ? coverCacheFileForId(shikimoriId)
    : path.join(getCoverCacheDir(), `url-${crypto.createHash("md5").update(url!).digest("hex")}.webp`);

  if (!settings.enabled) {
    const sourceUrl = await resolveCoverSourceUrl({ shikimoriId, url });
    if (!sourceUrl) return null;
    const buf = await fetchImageBuffer(sourceUrl, sourceUrl);
    if (!buf) return null;
    return { filePath: destPath, source: "url", cached: false, buffer: buf };
  }

  const cacheState = getCacheState(destPath, settings.maxAgeDays);

  if (!force && cacheState === "fresh") {
    if (shikimoriId) {
      await ensureCoverThumb(shikimoriId, destPath, settings);
    }
    return { filePath: destPath, source: "cache", cached: true };
  }

  if (force && fs.existsSync(destPath)) {
    await fsPromises.unlink(destPath);
    if (shikimoriId) await removeCoverThumbIfExists(shikimoriId);
  } else if (cacheState === "stale" && fs.existsSync(destPath)) {
    await fsPromises.unlink(destPath);
    if (shikimoriId) await removeCoverThumbIfExists(shikimoriId);
  }

  const source = await downloadCoverFromSources({ shikimoriId, url, destPath, settings });
  if (!source) return null;

  if (shikimoriId && fs.existsSync(destPath)) {
    await saveCoverThumbFromSource(destPath, coverCacheThumbFileForId(shikimoriId), settings);
  }

  return { filePath: destPath, source, cached: false };
}

export function readCoverCacheStats(): { count: number; total_size_mb: number } {
  const dir = getCoverCacheDir();
  if (!fs.existsSync(dir)) {
    return { count: 0, total_size_mb: 0 };
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".webp"));
  let totalSize = 0;
  for (const file of files) {
    totalSize += fs.statSync(path.join(dir, file)).size;
  }

  return {
    count: files.length,
    total_size_mb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
  };
}

export function buildCachedCoverResponse(
  filePath: string,
  request: Request,
  browserCacheSec = DEFAULT_COVER_BROWSER_CACHE_SEC,
): Response {
  const buffer = fs.readFileSync(filePath);
  return buildCoverBufferResponse(buffer, filePath, request, browserCacheSec);
}

export function buildCoverBufferResponse(
  buffer: Buffer,
  cacheKey: string,
  request: Request,
  browserCacheSec = DEFAULT_COVER_BROWSER_CACHE_SEC,
): Response {
  const lastModified = fs.existsSync(cacheKey)
    ? fs.statSync(cacheKey).mtime
    : new Date();
  const lastModifiedHeader = lastModified.toUTCString();
  const etag = `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;

  const ifModifiedSince = request.headers.get("if-modified-since");
  const ifNoneMatch = request.headers.get("if-none-match");

  if (
    (ifModifiedSince && ifModifiedSince === lastModifiedHeader) ||
    (ifNoneMatch && ifNoneMatch.trim() === etag)
  ) {
    return new Response(null, {
      status: 304,
      headers: {
        "Cache-Control": `public, max-age=${browserCacheSec}, immutable`,
        "Last-Modified": lastModifiedHeader,
        ETag: etag,
      },
    });
  }

  const expires = new Date(Date.now() + browserCacheSec * 1000).toUTCString();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": `public, max-age=${browserCacheSec}, immutable`,
      Expires: expires,
      "Last-Modified": lastModifiedHeader,
      ETag: etag,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
