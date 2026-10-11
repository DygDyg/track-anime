import { TA_PLUS_QUALITY_AUTO } from "@/lib/ta-plus-master-playlist";

const STORAGE_KEY = "track-anime:ta-plus-quality";

/** `"auto"` or a height key like `"720"`. */
export type TaPlusQualityPreference = string;

function normalizeQuality(value: unknown): TaPlusQualityPreference | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === TA_PLUS_QUALITY_AUTO) return TA_PLUS_QUALITY_AUTO;
  if (!/^\d{3,4}$/.test(trimmed)) return null;
  return trimmed;
}

export function readTaPlusQualityPreference(): TaPlusQualityPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // Plain string or legacy JSON `{ quality: "720" }`.
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as { quality?: unknown };
      return normalizeQuality(parsed.quality);
    }
    return normalizeQuality(raw);
  } catch {
    return null;
  }
}

export function writeTaPlusQualityPreference(quality: TaPlusQualityPreference): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeQuality(quality);
  if (!normalized) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // private mode / blocked storage
  }
}
