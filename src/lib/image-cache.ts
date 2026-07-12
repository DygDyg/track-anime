import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import sharp from "sharp";

export type ImageCacheKind = "studio" | "screenshot";

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const KIND_SETTINGS: Record<
  ImageCacheKind,
  { dir: string; quality: number; maxWidth: number; maxHeight: number }
> = {
  studio: { dir: "studio-logos", quality: 86, maxWidth: 420, maxHeight: 180 },
  screenshot: { dir: "screenshots", quality: 74, maxWidth: 1280, maxHeight: 720 },
};

const inflight = new Map<string, Promise<ImageCacheResult | null>>();

export type ImageCacheResult = {
  filePath: string;
  contentType: "image/webp";
  cached: boolean;
};

function imageCacheRoot(): string {
  const override = process.env.IMAGE_CACHE_DIR?.trim();
  if (override) return path.resolve(/* turbopackIgnore: true */ override);
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "image-cache");
}

function imageCacheDir(kind: ImageCacheKind): string {
  const root = imageCacheRoot();
  return kind === "studio"
    ? path.join(/* turbopackIgnore: true */ root, "studio-logos")
    : path.join(/* turbopackIgnore: true */ root, "screenshots");
}

function imageCachePath(kind: ImageCacheKind, url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return path.join(/* turbopackIgnore: true */ imageCacheDir(kind), `${hash}.webp`);
}

function isValidKind(value: string | null): value is ImageCacheKind {
  return value === "studio" || value === "screenshot";
}

export function parseImageCacheKind(value: string | null): ImageCacheKind | null {
  return isValidKind(value) ? value : null;
}

function isValidRemoteImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  let origin = "";
  try {
    origin = `${new URL(url).origin}/`;
  } catch {
    /* invalid URL is handled by caller */
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": FETCH_UA,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(origin ? { Referer: origin } : {}),
    },
    redirect: "follow",
  });

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.length >= 100 ? buffer : null;
}

function imageFetchUrls(url: string): string[] {
  const urls = [url];
  if (/^https:\/\//i.test(url)) {
    urls.push(url.replace(/^https:\/\//i, "http://"));
  }
  return urls;
}

async function writeCachedWebp(kind: ImageCacheKind, source: Buffer, destPath: string): Promise<boolean> {
  const settings = KIND_SETTINGS[kind];
  try {
    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
    await sharp(source)
      .resize({
        width: settings.maxWidth,
        height: settings.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .webp({ quality: settings.quality, smartSubsample: true })
      .toFile(destPath);
    return true;
  } catch (error) {
    console.error("[image-cache] encode failed:", error);
    return false;
  }
}

async function fetchAndCacheImageUncached(kind: ImageCacheKind, url: string): Promise<ImageCacheResult | null> {
  if (!isValidRemoteImageUrl(url)) return null;

  const filePath = imageCachePath(kind, url);
  if (fs.existsSync(/* turbopackIgnore: true */ filePath)) {
    return { filePath, contentType: "image/webp", cached: true };
  }

  let source: Buffer | null = null;
  for (const attemptUrl of imageFetchUrls(url)) {
    try {
      source = await fetchImageBuffer(attemptUrl);
      if (source) break;
    } catch {
      /* try next URL variant */
    }
  }
  if (!source) return null;

  const saved = await writeCachedWebp(kind, source, filePath);
  if (!saved) return null;

  return { filePath, contentType: "image/webp", cached: false };
}

export async function fetchAndCacheImage(kind: ImageCacheKind, url: string): Promise<ImageCacheResult | null> {
  const key = `${kind}:${url}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = fetchAndCacheImageUncached(kind, url).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export function buildImageCacheResponse(
  result: ImageCacheResult,
  request: Request,
  browserCacheSec = 60 * 60 * 24 * 30,
): Response {
  const buffer = fs.readFileSync(/* turbopackIgnore: true */ result.filePath);
  const stat = fs.statSync(/* turbopackIgnore: true */ result.filePath);
  const lastModified = stat.mtime.toUTCString();
  const etag = `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;

  const ifModifiedSince = request.headers.get("if-modified-since");
  const ifNoneMatch = request.headers.get("if-none-match");
  if (
    (ifModifiedSince && ifModifiedSince === lastModified) ||
    (ifNoneMatch && ifNoneMatch.trim() === etag)
  ) {
    return new Response(null, {
      status: 304,
      headers: {
        "Cache-Control": `public, max-age=${browserCacheSec}, immutable`,
        "Last-Modified": lastModified,
        ETag: etag,
      },
    });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": `public, max-age=${browserCacheSec}, immutable`,
      Expires: new Date(Date.now() + browserCacheSec * 1000).toUTCString(),
      "Last-Modified": lastModified,
      ETag: etag,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
