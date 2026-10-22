/**
 * Рамки профиля по модели Discord custom-profile-frame:
 * --container-width (контент карточки) + overflow top/bottom/horizontal в px дизайна.
 * Арт 1312 = 1200 + 56*2; слои рисуются на 100% расширенного холста.
 *
 * Legacy (драконы/КПК) + Discord collectibles из data/discord-profile-frames.json.
 */
import discordProfileFrames from "../../data/discord-profile-frames.json";

export type ProfileFramePlacement = "top" | "bottom" | "rail" | "stretch";

export type ProfileFrameDepth = "back" | "front";

export type ProfileFrameLayer = {
  file: string;
  placement: ProfileFramePlacement;
  depth: ProfileFrameDepth;
};

export type ProfileFrame = {
  id: string;
  label: string;
  /** Ширина контента карточки в макете (Discord: 1200). */
  designWidth: number;
  overflowTop: number;
  overflowBottom: number;
  overflowX: number;
  layers: readonly ProfileFrameLayer[];
};

/** Как в Discord для дракона (сапфир): container 1200, overflow 304 / 212 / 56. */
const DRAGON_DESIGN = {
  designWidth: 1200,
  overflowTop: 304,
  overflowBottom: 212,
  overflowX: 56,
} as const;

const DRAGON_LAYERS: readonly ProfileFrameLayer[] = [
  { file: "top", placement: "top", depth: "back" },
  { file: "glow", placement: "bottom", depth: "back" },
  { file: "sides", placement: "rail", depth: "back" },
  { file: "head", placement: "top", depth: "front" },
  { file: "tail", placement: "bottom", depth: "front" },
];

const PDA_LAYERS: readonly ProfileFrameLayer[] = [
  { file: "border", placement: "stretch", depth: "back" },
  { file: "top", placement: "top", depth: "front" },
  { file: "bottom", placement: "bottom", depth: "front" },
];

export const LEGACY_PROFILE_FRAMES: readonly ProfileFrame[] = [
  {
    id: "jade",
    label: "Нефритовый дракон",
    ...DRAGON_DESIGN,
    layers: DRAGON_LAYERS,
  },
  {
    id: "rose",
    label: "Розовый дракон",
    ...DRAGON_DESIGN,
    layers: DRAGON_LAYERS,
  },
  {
    id: "ruby",
    label: "Рубиновый дракон",
    ...DRAGON_DESIGN,
    layers: DRAGON_LAYERS,
  },
  {
    id: "sapphire",
    label: "Сапфировый дракон",
    ...DRAGON_DESIGN,
    layers: DRAGON_LAYERS,
  },
  {
    id: "pda",
    label: "КПК",
    designWidth: 1200,
    overflowTop: 300,
    overflowBottom: 200,
    overflowX: 56,
    layers: PDA_LAYERS,
  },
];

const DISCORD_FRAMES: readonly ProfileFrame[] = (discordProfileFrames as ProfileFrame[]).map(
  (frame) => ({
    ...frame,
    layers: frame.layers,
  }),
);

export const PROFILE_FRAMES: readonly ProfileFrame[] = [...LEGACY_PROFILE_FRAMES, ...DISCORD_FRAMES];

/** @deprecated используйте PROFILE_FRAMES[].id; оставлен для совместимости импортов */
export const PROFILE_FRAME_IDS = LEGACY_PROFILE_FRAMES.map((f) => f.id);

export type ProfileFrameId = string;

const PROFILE_FRAME_BY_ID = new Map<string, ProfileFrame>(
  PROFILE_FRAMES.map((frame) => [frame.id, frame]),
);

export function getProfileFrame(id: string | null | undefined): ProfileFrame | null {
  if (!id) return null;
  return PROFILE_FRAME_BY_ID.get(id) ?? null;
}

export function normalizeProfileFrameId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return PROFILE_FRAME_BY_ID.has(value) ? value : null;
}

export function profileFrameLayerUrl(id: string, file: string): string | null {
  if (!PROFILE_FRAME_BY_ID.has(id)) return null;
  return `/profile-frames/${id}/${file}.webp`;
}

export function profileFrameThumbUrl(id: string | null | undefined): string | null {
  if (!id || !PROFILE_FRAME_BY_ID.has(id)) return null;
  return `/profile-frames/thumbs/${id}.webp`;
}

/** Inline CSS-переменные на оболочку (как Discord custom-profile-frame). */
export function profileFrameCssVars(frame: ProfileFrame): Record<string, string> {
  return {
    "--profile-frame-design-width": String(frame.designWidth),
    "--profile-frame-overflow-top": String(frame.overflowTop),
    "--profile-frame-overflow-bottom": String(frame.overflowBottom),
    "--profile-frame-overflow-x": String(frame.overflowX),
  };
}
