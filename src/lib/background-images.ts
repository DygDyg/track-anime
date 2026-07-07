import fs from "fs";
import path from "path";

const IMAGE_EXT = /\.(webp|jpe?g|png|gif|avif)$/i;

type CachedListing = {
  dir: string;
  mtimeMs: number;
  files: string[];
};

let cachedListing: CachedListing | null = null;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name);
}

/** Каталог с фонами: `public/bg` или корневой `bg`. */
export function getBackgroundImagesDir(): string | null {
  const root = /* turbopackIgnore: true */ process.cwd();
  const candidates = [
    path.join(root, "public", "bg"),
    path.join(root, "bg"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ dir) && fs.statSync(/* turbopackIgnore: true */ dir).isDirectory()) {
      return dir;
    }
  }

  return null;
}

function fileToUrl(file: string, dir: string): string {
  const root = /* turbopackIgnore: true */ process.cwd();
  const publicDir = path.join(root, "public", "bg");
  const inPublic = dir === path.normalize(publicDir);

  if (inPublic) {
    return `/bg/${encodeURIComponent(file)}`;
  }

  return `/api/bg/${encodeURIComponent(file)}`;
}

export function listBackgroundImages(): string[] {
  const dir = getBackgroundImagesDir();
  if (!dir) return [];

  const mtimeMs = fs.statSync(/* turbopackIgnore: true */ dir).mtimeMs;
  if (cachedListing?.dir === dir && cachedListing.mtimeMs === mtimeMs) {
    return cachedListing.files;
  }

  const files = fs.readdirSync(/* turbopackIgnore: true */ dir).filter(isImageFile).sort();
  cachedListing = { dir, mtimeMs, files };
  return files;
}

export function listBackgroundImageUrls(): string[] {
  const dir = getBackgroundImagesDir();
  if (!dir) return [];
  return listBackgroundImages().map((file) => fileToUrl(file, dir));
}

export function backgroundImageLabelFromUrl(url: string): string {
  const fileName = decodeURIComponent(url.split("/").pop() ?? url);
  const withoutExt = fileName.replace(/\.(webp|jpe?g|png|gif|avif)$/i, "");
  return withoutExt.replace(/[-_]+/g, " ").trim() || fileName;
}

export function listBackgroundImageEntries(): Array<{ url: string; label: string }> {
  return listBackgroundImageUrls().map((url) => ({
    url,
    label: backgroundImageLabelFromUrl(url),
  }));
}

/** @deprecated Используйте listBackgroundImageUrls + клиентский SiteBackground */
export function getRandomBackgroundImageUrl(): string | null {
  const urls = listBackgroundImageUrls();
  if (urls.length === 0) return null;
  return urls[Math.floor(Math.random() * urls.length)]!;
}
