/** TA Plus ambient edge glow preference (ultrawide-friendly). Off by default. */

export const PLAYER_AMBIENT_GLOW_STORAGE_KEY = "ta:player-ambient-glow";

/** Strictly wider than 16:9 (float epsilon). */
const WIDER_THAN_16x9 = 16 / 9 + 0.001;

export const PLAYER_AMBIENT_GLOW_BLUR_MIN = 20;
export const PLAYER_AMBIENT_GLOW_BLUR_MAX = 160;
export const PLAYER_AMBIENT_GLOW_BLUR_DEFAULT = 96;
export const PLAYER_AMBIENT_GLOW_BLUR_STEP = 4;

export const PLAYER_AMBIENT_GLOW_OPACITY_MIN = 0.1;
export const PLAYER_AMBIENT_GLOW_OPACITY_MAX = 0.95;
export const PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT = 0.65;
export const PLAYER_AMBIENT_GLOW_OPACITY_STEP = 0.05;

export const PLAYER_AMBIENT_GLOW_BRIGHTNESS_MIN = 0.5;
export const PLAYER_AMBIENT_GLOW_BRIGHTNESS_MAX = 2;
export const PLAYER_AMBIENT_GLOW_BRIGHTNESS_DEFAULT = 1.1;
export const PLAYER_AMBIENT_GLOW_BRIGHTNESS_STEP = 0.05;

export const PLAYER_AMBIENT_GLOW_SATURATE_MIN = 0;
export const PLAYER_AMBIENT_GLOW_SATURATE_MAX = 3;
export const PLAYER_AMBIENT_GLOW_SATURATE_DEFAULT = 1.2;
export const PLAYER_AMBIENT_GLOW_SATURATE_STEP = 0.1;

export const PLAYER_AMBIENT_GLOW_SCALE_MIN = 1;
export const PLAYER_AMBIENT_GLOW_SCALE_MAX = 1.35;
export const PLAYER_AMBIENT_GLOW_SCALE_DEFAULT = 1.08;
export const PLAYER_AMBIENT_GLOW_SCALE_STEP = 0.01;

export const PLAYER_AMBIENT_GLOW_DOWNSCALE_MIN = 0.04;
export const PLAYER_AMBIENT_GLOW_DOWNSCALE_MAX = 0.2;
export const PLAYER_AMBIENT_GLOW_DOWNSCALE_DEFAULT = 0.08;
export const PLAYER_AMBIENT_GLOW_DOWNSCALE_STEP = 0.01;

export const PLAYER_AMBIENT_GLOW_UPDATE_MS_MIN = 50;
export const PLAYER_AMBIENT_GLOW_UPDATE_MS_MAX = 500;
export const PLAYER_AMBIENT_GLOW_UPDATE_MS_DEFAULT = 98;
export const PLAYER_AMBIENT_GLOW_UPDATE_MS_STEP = 16;

/** @deprecated Use PLAYER_AMBIENT_GLOW_OPACITY_* */
export const PLAYER_AMBIENT_GLOW_INTENSITY_MIN = PLAYER_AMBIENT_GLOW_OPACITY_MIN;
/** @deprecated */
export const PLAYER_AMBIENT_GLOW_INTENSITY_MAX = PLAYER_AMBIENT_GLOW_OPACITY_MAX;
/** @deprecated */
export const PLAYER_AMBIENT_GLOW_INTENSITY_DEFAULT = PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT;
/** @deprecated */
export const PLAYER_AMBIENT_GLOW_INTENSITY_STEP = PLAYER_AMBIENT_GLOW_OPACITY_STEP;

export type PlayerAmbientGlowSettings = {
  enabled: boolean;
  /** CSS blur radius in px. */
  blur: number;
  /** CSS opacity of the glow layer. */
  opacity: number;
  /** CSS filter brightness multiplier. */
  brightness: number;
  /** CSS filter saturate multiplier. */
  saturate: number;
  /** CSS transform scale of the glow layer. */
  scale: number;
  /** Frame sample size as fraction of video dimensions. */
  downscale: number;
  /** Min ms between canvas redraws. */
  updateIntervalMs: number;
};

export type PlayerAmbientGlowPresetId =
  | "default"
  | "subtle"
  | "dramatic"
  | "monochrome"
  | "neon"
  | "performance"
  | "quality";

export type PlayerAmbientGlowPreset = {
  id: PlayerAmbientGlowPresetId;
  label: string;
  values: Omit<PlayerAmbientGlowSettings, "enabled">;
};

export const DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS: PlayerAmbientGlowSettings = {
  enabled: false,
  blur: PLAYER_AMBIENT_GLOW_BLUR_DEFAULT,
  opacity: PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT,
  brightness: PLAYER_AMBIENT_GLOW_BRIGHTNESS_DEFAULT,
  saturate: PLAYER_AMBIENT_GLOW_SATURATE_DEFAULT,
  scale: PLAYER_AMBIENT_GLOW_SCALE_DEFAULT,
  downscale: PLAYER_AMBIENT_GLOW_DOWNSCALE_DEFAULT,
  updateIntervalMs: PLAYER_AMBIENT_GLOW_UPDATE_MS_DEFAULT,
};

/** Presets aligned with video-ambient-glow demo (labels in Russian). */
export const PLAYER_AMBIENT_GLOW_PRESETS: PlayerAmbientGlowPreset[] = [
  {
    id: "default",
    label: "Обычная",
    values: {
      blur: 96,
      opacity: 0.65,
      brightness: 1.1,
      saturate: 1.2,
      scale: 1.08,
      downscale: 0.08,
      updateIntervalMs: 98,
    },
  },
  {
    id: "subtle",
    label: "Мягкая",
    values: {
      blur: 60,
      opacity: 0.3,
      brightness: 0.9,
      saturate: 0.8,
      scale: 1.05,
      downscale: 0.08,
      updateIntervalMs: 120,
    },
  },
  {
    id: "dramatic",
    label: "Яркая",
    values: {
      blur: 150,
      opacity: 0.9,
      brightness: 1.4,
      saturate: 2,
      scale: 1.15,
      downscale: 0.1,
      updateIntervalMs: 80,
    },
  },
  {
    id: "monochrome",
    label: "Монохром",
    values: {
      blur: 100,
      opacity: 0.6,
      brightness: 1,
      saturate: 0.2,
      scale: 1.1,
      downscale: 0.08,
      updateIntervalMs: 98,
    },
  },
  {
    id: "neon",
    label: "Неон",
    values: {
      blur: 120,
      opacity: 0.8,
      brightness: 1.6,
      saturate: 3,
      scale: 1.12,
      downscale: 0.1,
      updateIntervalMs: 80,
    },
  },
  {
    id: "performance",
    label: "Быстрая",
    values: {
      blur: 80,
      opacity: 0.55,
      brightness: 1.05,
      saturate: 1.1,
      scale: 1.08,
      downscale: 0.04,
      updateIntervalMs: 200,
    },
  },
  {
    id: "quality",
    label: "Чёткая",
    values: {
      blur: 120,
      opacity: 0.7,
      brightness: 1.15,
      saturate: 1.4,
      scale: 1.1,
      downscale: 0.15,
      updateIntervalMs: 66,
    },
  },
];

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampAmbientGlowBlur(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_BLUR_MIN,
    PLAYER_AMBIENT_GLOW_BLUR_MAX,
    PLAYER_AMBIENT_GLOW_BLUR_DEFAULT,
  );
}

export function clampAmbientGlowOpacity(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_OPACITY_MIN,
    PLAYER_AMBIENT_GLOW_OPACITY_MAX,
    PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT,
  );
}

/** @deprecated Use clampAmbientGlowOpacity */
export function clampAmbientGlowIntensity(value: number): number {
  return clampAmbientGlowOpacity(value);
}

export function clampAmbientGlowBrightness(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_BRIGHTNESS_MIN,
    PLAYER_AMBIENT_GLOW_BRIGHTNESS_MAX,
    PLAYER_AMBIENT_GLOW_BRIGHTNESS_DEFAULT,
  );
}

export function clampAmbientGlowSaturate(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_SATURATE_MIN,
    PLAYER_AMBIENT_GLOW_SATURATE_MAX,
    PLAYER_AMBIENT_GLOW_SATURATE_DEFAULT,
  );
}

export function clampAmbientGlowScale(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_SCALE_MIN,
    PLAYER_AMBIENT_GLOW_SCALE_MAX,
    PLAYER_AMBIENT_GLOW_SCALE_DEFAULT,
  );
}

export function clampAmbientGlowDownscale(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_DOWNSCALE_MIN,
    PLAYER_AMBIENT_GLOW_DOWNSCALE_MAX,
    PLAYER_AMBIENT_GLOW_DOWNSCALE_DEFAULT,
  );
}

export function clampAmbientGlowUpdateIntervalMs(value: number): number {
  return clamp(
    value,
    PLAYER_AMBIENT_GLOW_UPDATE_MS_MIN,
    PLAYER_AMBIENT_GLOW_UPDATE_MS_MAX,
    PLAYER_AMBIENT_GLOW_UPDATE_MS_DEFAULT,
  );
}

export function normalizePlayerAmbientGlowSettings(raw: unknown): PlayerAmbientGlowSettings {
  if (raw === "1" || raw === 1 || raw === true) {
    return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS, enabled: true };
  }
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS };
  }
  const obj = raw as Partial<PlayerAmbientGlowSettings> & { intensity?: number };
  const opacityRaw =
    typeof obj.opacity === "number"
      ? obj.opacity
      : typeof obj.intensity === "number"
        ? obj.intensity
        : PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT;
  return {
    enabled: obj.enabled === true,
    blur: clampAmbientGlowBlur(
      typeof obj.blur === "number" ? obj.blur : PLAYER_AMBIENT_GLOW_BLUR_DEFAULT,
    ),
    opacity: clampAmbientGlowOpacity(opacityRaw),
    brightness: clampAmbientGlowBrightness(
      typeof obj.brightness === "number"
        ? obj.brightness
        : PLAYER_AMBIENT_GLOW_BRIGHTNESS_DEFAULT,
    ),
    saturate: clampAmbientGlowSaturate(
      typeof obj.saturate === "number" ? obj.saturate : PLAYER_AMBIENT_GLOW_SATURATE_DEFAULT,
    ),
    scale: clampAmbientGlowScale(
      typeof obj.scale === "number" ? obj.scale : PLAYER_AMBIENT_GLOW_SCALE_DEFAULT,
    ),
    downscale: clampAmbientGlowDownscale(
      typeof obj.downscale === "number" ? obj.downscale : PLAYER_AMBIENT_GLOW_DOWNSCALE_DEFAULT,
    ),
    updateIntervalMs: clampAmbientGlowUpdateIntervalMs(
      typeof obj.updateIntervalMs === "number"
        ? obj.updateIntervalMs
        : PLAYER_AMBIENT_GLOW_UPDATE_MS_DEFAULT,
    ),
  };
}

export function readPlayerAmbientGlowSettings(): PlayerAmbientGlowSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS };
  try {
    const raw = window.localStorage.getItem(PLAYER_AMBIENT_GLOW_STORAGE_KEY);
    if (raw == null) return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS };
    if (raw === "1") return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS, enabled: true };
    if (raw === "0") return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS, enabled: false };
    return normalizePlayerAmbientGlowSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS };
  }
}

/** @deprecated Use readPlayerAmbientGlowSettings().enabled */
export function readPlayerAmbientGlowPreference(): boolean {
  return readPlayerAmbientGlowSettings().enabled;
}

export function writePlayerAmbientGlowSettings(settings: PlayerAmbientGlowSettings): void {
  if (typeof window === "undefined") return;
  try {
    const next = normalizePlayerAmbientGlowSettings(settings);
    window.localStorage.setItem(PLAYER_AMBIENT_GLOW_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
}

/** @deprecated Use writePlayerAmbientGlowSettings */
export function writePlayerAmbientGlowPreference(enabled: boolean): void {
  const current = readPlayerAmbientGlowSettings();
  writePlayerAmbientGlowSettings({ ...current, enabled });
}

export function applyAmbientGlowPreset(
  current: PlayerAmbientGlowSettings,
  presetId: PlayerAmbientGlowPresetId,
): PlayerAmbientGlowSettings {
  const preset = PLAYER_AMBIENT_GLOW_PRESETS.find((item) => item.id === presetId);
  if (!preset) return current;
  return normalizePlayerAmbientGlowSettings({
    ...current,
    ...preset.values,
    enabled: current.enabled,
  });
}

/**
 * True when the current display is wider than 16:9.
 * Uses `window.screen` so a windowed browser on an ultrawide monitor still qualifies.
 */
export function isDisplayWiderThan16x9(): boolean {
  if (typeof window === "undefined") return false;
  const width = window.screen?.width ?? 0;
  const height = window.screen?.height ?? 0;
  if (!(width > 0 && height > 0)) return false;
  return width / height > WIDER_THAN_16x9;
}
