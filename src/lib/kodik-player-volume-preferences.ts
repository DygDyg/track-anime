export type KodikPlayerVolumePreferences = {
  volume: number;
  muted: boolean;
};

const STORAGE_KEY = "track-anime:kodik-player-volume";

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeVolume(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clampVolume(value);
}

export function readKodikPlayerVolumePreferences(): KodikPlayerVolumePreferences | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<KodikPlayerVolumePreferences>;
    const volume = normalizeVolume(parsed.volume);
    if (volume == null) return null;

    return {
      volume,
      muted: parsed.muted === true,
    };
  } catch {
    return null;
  }
}

export function writeKodikPlayerVolumePreferences(
  preferences: KodikPlayerVolumePreferences,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: clampVolume(preferences.volume),
        muted: preferences.muted === true,
      }),
    );
  } catch {
    // localStorage может быть недоступен в приватном режиме или при жёстких настройках браузера.
  }
}
