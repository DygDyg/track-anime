/** Client-safe cover source order constants (no prisma / sharp / fs). */

export const COVER_SOURCE_IDS = [
  "url",
  "kodik",
  "material_db",
  "cvh",
  "shikimori",
  "worldart",
] as const;

export type CoverSourceId = (typeof COVER_SOURCE_IDS)[number];

export type CoverSourceOrderConfig = {
  order: CoverSourceId[];
  enabled: Record<CoverSourceId, boolean>;
};

/** Старый дефолт до CVH→перед Shikimori; для миграции сохранённых настроек. */
const LEGACY_DEFAULT_COVER_SOURCE_ORDER: CoverSourceId[] = [
  "url",
  "kodik",
  "material_db",
  "shikimori",
  "cvh",
  "worldart",
];

export const COVER_SOURCE_LABELS: Record<CoverSourceId, string> = {
  url: "Прямой URL (?url=)",
  kodik: "Kodik API",
  material_db: "Локальная БД (materials / releases)",
  shikimori: "Shikimori API",
  cvh: "CDN VideoHub (Content API)",
  worldart: "World-Art (через Kodik)",
};

export const DEFAULT_COVER_SOURCE_ORDER: CoverSourceOrderConfig = {
  order: [...COVER_SOURCE_IDS],
  enabled: {
    url: true,
    kodik: true,
    material_db: true,
    shikimori: true,
    cvh: true,
    worldart: true,
  },
};

function isCoverSourceId(value: unknown): value is CoverSourceId {
  return typeof value === "string" && (COVER_SOURCE_IDS as readonly string[]).includes(value);
}

/** Нормализация JSON из БД / PATCH: только известные id, без дублей, недостающие в конец. */
export function normalizeCoverSourceOrder(raw: unknown): CoverSourceOrderConfig {
  const defaults = DEFAULT_COVER_SOURCE_ORDER;
  const order: CoverSourceId[] = [];
  const seen = new Set<CoverSourceId>();

  const rawOrder = raw && typeof raw === "object" ? (raw as { order?: unknown }).order : null;
  if (Array.isArray(rawOrder)) {
    for (const item of rawOrder) {
      if (!isCoverSourceId(item) || seen.has(item)) continue;
      seen.add(item);
      order.push(item);
    }
  }

  for (const id of COVER_SOURCE_IDS) {
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }

  // Сохранённый в БД старый дефолт → новый (CVH перед Shikimori). Кастомный порядок не трогаем.
  if (order.join("\0") === LEGACY_DEFAULT_COVER_SOURCE_ORDER.join("\0")) {
    order.splice(0, order.length, ...COVER_SOURCE_IDS);
  }

  const enabled = { ...defaults.enabled };
  const rawEnabled =
    raw && typeof raw === "object" ? (raw as { enabled?: unknown }).enabled : null;
  if (rawEnabled && typeof rawEnabled === "object") {
    for (const id of COVER_SOURCE_IDS) {
      const value = (rawEnabled as Record<string, unknown>)[id];
      if (typeof value === "boolean") enabled[id] = value;
    }
  }

  return { order, enabled };
}

export function listEnabledCoverSources(config: CoverSourceOrderConfig): CoverSourceId[] {
  return config.order.filter((id) => config.enabled[id] !== false);
}
