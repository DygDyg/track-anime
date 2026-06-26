import type { CSSProperties } from "react";
import type { Theme } from "@/lib/theme";

export type TranslationColorSet = {
  bg: string;
  text: string;
  border: string;
  bgActive: string;
};

type StudioPalette = {
  id: string;
  match: (name: string) => boolean;
  dark: TranslationColorSet;
  light: TranslationColorSet;
};

function palette(
  id: string,
  match: (name: string) => boolean,
  hue: { r: number; g: number; b: number },
): StudioPalette {
  const { r, g, b } = hue;
  return {
    id,
    match,
    dark: {
      bg: `rgba(${r}, ${g}, ${b}, 0.16)`,
      text: `rgb(${Math.min(r + 70, 255)}, ${Math.min(g + 70, 255)}, ${Math.min(b + 70, 255)})`,
      border: `rgba(${r}, ${g}, ${b}, 0.42)`,
      bgActive: `rgba(${r}, ${g}, ${b}, 0.28)`,
    },
    light: {
      bg: `rgba(${r}, ${g}, ${b}, 0.1)`,
      text: `rgb(${Math.max(r - 40, 0)}, ${Math.max(g - 40, 0)}, ${Math.max(b - 40, 0)})`,
      border: `rgba(${r}, ${g}, ${b}, 0.32)`,
      bgActive: `rgba(${r}, ${g}, ${b}, 0.2)`,
    },
  };
}

const rx = (pattern: string) => (name: string) => new RegExp(pattern, "i").test(name);

/** Популярные озвучки Kodik — порядок важен (сначала более специфичные). */
const STUDIO_PALETTES: StudioPalette[] = [
  palette("anilib", rx("anilib"), { r: 67, g: 160, b: 71 }),
  palette("anidub", rx("anidub"), { r: 229, g: 57, b: 53 }),
  palette("animevost", rx("animevost"), { r: 142, g: 36, b: 170 }),
  palette("anistar", rx("anistar"), { r: 30, g: 136, b: 229 }),
  palette("crunchyroll", rx("crunchyroll"), { r: 244, g: 117, b: 33 }),
  palette("anibaza", rx("anibaza"), { r: 0, g: 137, b: 123 }),
  palette("animy", rx("animy"), { r: 158, g: 157, b: 36 }),
  palette("dream-cast", rx("dream cast|dreamyvoice"), { r: 255, g: 179, b: 0 }),
  palette("jam", rx("jam"), { r: 236, g: 64, b: 122 }),
  palette("shiza", rx("shiza"), { r: 123, g: 31, b: 162 }),
  palette("fumodub", rx("fumodub|fumoffu"), { r: 255, g: 112, b: 67 }),
  palette("animaunt", rx("animaunt"), { r: 0, g: 172, b: 193 }),
  palette("kazoku", rx("kazoku"), { r: 57, g: 73, b: 171 }),
  palette("red-head", rx("red head"), { r: 198, g: 40, b: 40 }),
  palette("onwave", rx("onwave"), { r: 41, g: 182, b: 246 }),
  palette("silver-aniage", rx("silver aniage|aniage"), { r: 120, g: 144, b: 156 }),
  palette("todo-dublyazh", rx("то дубляж|дубляжная"), { r: 251, g: 140, b: 0 }),
  palette("komnata-didi", rx("комната диди|диди"), { r: 253, g: 216, b: 53 }),
  palette("anicosmic", rx("anicosmic"), { r: 92, g: 107, b: 192 }),
  palette("fsg-sanae", rx("fsg sanae|sanae"), { r: 38, g: 166, b: 154 }),
  palette("anifilm", rx("anifilm"), { r: 63, g: 81, b: 181 }),
  palette("studio-band", rx("studio band|\\bband\\b"), { r: 171, g: 71, b: 188 }),
  palette("reanimedia", rx("reanimedia|reanime"), { r: 173, g: 20, b: 87 }),
  palette("youkai", rx("youkai"), { r: 126, g: 87, b: 194 }),
  palette("flowers-media", rx("flowers media"), { r: 102, g: 187, b: 106 }),
  palette("ogurcik", rx("огурчик"), { r: 124, g: 179, b: 66 }),
  palette("blackcat", rx("blackcat"), { r: 66, g: 66, b: 66 }),
  palette("heat-sound", rx("heat.?sound"), { r: 255, g: 87, b: 34 }),
  palette("calliope", rx("calliope"), { r: 186, g: 104, b: 200 }),
  palette("new-horizons", rx("new horizons"), { r: 3, g: 169, b: 244 }),
  palette("mda", rx("mda"), { r: 96, g: 125, b: 139 }),
  palette("deep", rx("deep"), { r: 69, g: 90, b: 100 }),
  palette("dublirovan", rx("дублирован"), { r: 141, g: 110, b: 99 }),
  palette("subtitles", rx("\\.subtitles|субтитр"), { r: 144, g: 164, b: 174 }),
];

export function resolveTranslationStudioId(name: string): string | null {
  const normalized = name.trim();
  if (!normalized) return null;

  for (const studio of STUDIO_PALETTES) {
    if (studio.match(normalized)) {
      return studio.id;
    }
  }

  return null;
}

export function isPopularTranslationName(name: string): boolean {
  return resolveTranslationStudioId(name) !== null;
}

export function filterPopularTranslationNames(names: string[]): string[] {
  return names.filter((name) => isPopularTranslationName(name));
}

export function resolveTranslationColors(
  name: string,
  theme: Theme,
): TranslationColorSet | null {
  const normalized = name.trim();
  if (!normalized) return null;

  for (const studio of STUDIO_PALETTES) {
    if (studio.match(normalized)) {
      return theme === "light" ? studio.light : studio.dark;
    }
  }

  return null;
}

export function translationColorStyle(
  colors: TranslationColorSet | null,
): CSSProperties | undefined {
  if (!colors) return undefined;
  return {
    backgroundColor: colors.bg,
    color: colors.text,
    borderColor: colors.border,
  };
}

export function translationButtonStyle(
  colors: TranslationColorSet | null,
  active: boolean,
): CSSProperties | undefined {
  if (!colors) return undefined;
  return {
    backgroundColor: active ? colors.bgActive : colors.bg,
    color: colors.text,
    borderColor: colors.border,
  };
}
