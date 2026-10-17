const STORAGE_KEY = "track-anime:ta-plus-video-fit";

/** Fit video in the frame without distortion. */
export type TaPlusVideoFit = "contain" | "cover";

export const TA_PLUS_VIDEO_FIT_DEFAULT: TaPlusVideoFit = "contain";

function normalizeVideoFit(value: unknown): TaPlusVideoFit | null {
  if (value === "contain" || value === "cover") return value;
  return null;
}

export function readTaPlusVideoFitPreference(): TaPlusVideoFit {
  if (typeof window === "undefined") return TA_PLUS_VIDEO_FIT_DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return TA_PLUS_VIDEO_FIT_DEFAULT;
    return normalizeVideoFit(raw) ?? TA_PLUS_VIDEO_FIT_DEFAULT;
  } catch {
    return TA_PLUS_VIDEO_FIT_DEFAULT;
  }
}

export function writeTaPlusVideoFitPreference(fit: TaPlusVideoFit): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeVideoFit(fit);
  if (!normalized) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // private mode / blocked storage
  }
}
