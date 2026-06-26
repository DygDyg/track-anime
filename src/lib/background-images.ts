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
  const candidates = [
    path.join(process.cwd(), "public", "bg"),
    path.join(process.cwd(), "bg"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }

  return null;
}

function fileToUrl(file: string, dir: string): string {
  const publicDir = path.join(process.cwd(), "public", "bg");
  const inPublic = dir === path.normalize(publicDir);

  if (inPublic) {
    return `/bg/${encodeURIComponent(file)}`;
  }

  return `/api/bg/${encodeURIComponent(file)}`;
}

export function listBackgroundImages(): string[] {
  const dir = getBackgroundImagesDir();
  if (!dir) return [];

  const mtimeMs = fs.statSync(dir).mtimeMs;
  if (cachedListing?.dir === dir && cachedListing.mtimeMs === mtimeMs) {
    return cachedListing.files;
  }

  const files = fs.readdirSync(dir).filter(isImageFile).sort();
  cachedListing = { dir, mtimeMs, files };
  return files;
}

export function listBackgroundImageUrls(): string[] {
  const dir = getBackgroundImagesDir();
  if (!dir) return [];
  return listBackgroundImages().map((file) => fileToUrl(file, dir));
}

/** @deprecated Используйте listBackgroundImageUrls + клиентский SiteBackground */
export function getRandomBackgroundImageUrl(): string | null {
  const urls = listBackgroundImageUrls();
  if (urls.length === 0) return null;
  return urls[Math.floor(Math.random() * urls.length)]!;
}
