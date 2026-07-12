import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import "server-only";
import { getBrandRotationSettingsDto } from "@/lib/admin/brand-rotation-settings";
import { SITE_LOGO_PATH, SITE_LOGO_VERSION } from "@/lib/site-brand";

export const BRAND_LOGOS_PUBLIC_PATH = "/brand-logos";
export const BRAND_LOGOS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "brand-logos");

export type BrandLogoFile = {
  fileName: string;
  publicPath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
};

export type ActiveBrandAsset = {
  logoSrc: string;
  cacheKey: string;
  file: BrandLogoFile | null;
  rotationEnabled: boolean;
  intervalMinutes: number;
  slot: number;
};

const WEBP_FILE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.webp$/i;
const LIST_CACHE_MS = 30_000;
let cachedLogoFiles: { value: BrandLogoFile[]; at: number } | null = null;

export function invalidateBrandLogoFilesCache(): void {
  cachedLogoFiles = null;
}

function fallbackBrandAsset(intervalMinutes = 120): ActiveBrandAsset {
  return {
    logoSrc: `${SITE_LOGO_PATH}?v=${SITE_LOGO_VERSION}`,
    cacheKey: SITE_LOGO_VERSION,
    file: null,
    rotationEnabled: false,
    intervalMinutes,
    slot: 0,
  };
}

export async function listBrandLogoFiles(): Promise<BrandLogoFile[]> {
  if (cachedLogoFiles && Date.now() - cachedLogoFiles.at < LIST_CACHE_MS) {
    return cachedLogoFiles.value;
  }

  let entries: string[];
  try {
    entries = await fs.readdir(/* turbopackIgnore: true */ BRAND_LOGOS_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[brand-rotation] failed to read logos dir:", error);
    }
    cachedLogoFiles = { value: [], at: Date.now() };
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((fileName) => WEBP_FILE_RE.test(fileName))
      .map(async (fileName): Promise<BrandLogoFile | null> => {
        const absolutePath = path.join(/* turbopackIgnore: true */ BRAND_LOGOS_DIR, fileName);
        try {
          const stat = await fs.stat(/* turbopackIgnore: true */ absolutePath);
          if (!stat.isFile()) return null;
          return {
            fileName,
            publicPath: `${BRAND_LOGOS_PUBLIC_PATH}/${encodeURIComponent(fileName)}`,
            absolutePath,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          };
        } catch {
          return null;
        }
      }),
  );

  const value = files
    .filter((file): file is BrandLogoFile => file !== null)
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
  cachedLogoFiles = { value, at: Date.now() };
  return value;
}

function pickLogoForSlot(files: BrandLogoFile[], slot: number, rotationSeed: string): BrandLogoFile {
  return files
    .map((file) => ({
      file,
      rank: crypto
        .createHash("sha256")
        .update(`${rotationSeed}:${slot}:${file.fileName}`)
        .digest("hex"),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))[0].file;
}

export async function getActiveBrandAsset(now = new Date()): Promise<ActiveBrandAsset> {
  const settings = await getBrandRotationSettingsDto();
  if (!settings.enabled) return fallbackBrandAsset(settings.intervalMinutes);

  const files = await listBrandLogoFiles();
  if (files.length === 0) return fallbackBrandAsset(settings.intervalMinutes);

  const intervalMs = settings.intervalMinutes * 60 * 1000;
  const slot = Math.floor(now.getTime() / intervalMs);
  const file = pickLogoForSlot(files, slot, settings.rotationSeed);
  const cacheKey = [
    slot,
    settings.rotationSeed,
    file.fileName,
    Math.round(file.mtimeMs),
    file.size,
    settings.intervalMinutes,
  ].join("-");

  return {
    logoSrc: `/api/brand/logo?v=${encodeURIComponent(cacheKey)}`,
    cacheKey,
    file,
    rotationEnabled: true,
    intervalMinutes: settings.intervalMinutes,
    slot,
  };
}
