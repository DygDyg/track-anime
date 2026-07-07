import { prisma } from "@/lib/prisma";
import {
  clampTranslationIntroOffsetSec,
  parseTranslationIntroOffsets,
  type TranslationIntroOffsets,
} from "@/lib/translation-intro-offset";

export const TRANSLATION_INTRO_SETTINGS_ID = "default";

export type TranslationIntroStatRow = {
  translationName: string;
  contributors: number;
  avgSeconds: number | null;
};

export type TranslationIntroSettingsDto = {
  forcedOffsets: TranslationIntroOffsets;
  stats: TranslationIntroStatRow[];
  updatedAt: string;
};

type TranslationIntroSettingsRow = {
  forcedOffsets: unknown;
  updatedAt: Date;
};

type TranslationIntroSettingsDelegate = {
  upsert: (args: {
    where: { id: string };
    create: { id: string; forcedOffsets: TranslationIntroOffsets };
    update: Record<string, never>;
  }) => Promise<TranslationIntroSettingsRow>;
  findUniqueOrThrow: (args: { where: { id: string } }) => Promise<TranslationIntroSettingsRow>;
  update: (args: {
    where: { id: string };
    data: { forcedOffsets: TranslationIntroOffsets };
  }) => Promise<TranslationIntroSettingsRow>;
};

type PrismaClientWithIntroSettings = typeof prisma & {
  translationIntroSettings?: TranslationIntroSettingsDelegate;
};

function getDelegate(): TranslationIntroSettingsDelegate | null {
  return (prisma as PrismaClientWithIntroSettings).translationIntroSettings ?? null;
}

function fallbackDto(): TranslationIntroSettingsDto {
  return {
    forcedOffsets: {},
    stats: [],
    updatedAt: new Date(0).toISOString(),
  };
}

let cachedForcedOffsets: { value: TranslationIntroOffsets; at: number } | null = null;
const FORCED_CACHE_MS = 30_000;

export function invalidateTranslationIntroForcedCache(): void {
  cachedForcedOffsets = null;
}

export async function ensureTranslationIntroSettings(): Promise<void> {
  const delegate = getDelegate();
  if (!delegate) return;

  await delegate.upsert({
    where: { id: TRANSLATION_INTRO_SETTINGS_ID },
    create: {
      id: TRANSLATION_INTRO_SETTINGS_ID,
      forcedOffsets: {},
    },
    update: {},
  });
}

export async function getForcedTranslationIntroOffsets(): Promise<TranslationIntroOffsets> {
  if (cachedForcedOffsets && Date.now() - cachedForcedOffsets.at < FORCED_CACHE_MS) {
    return cachedForcedOffsets.value;
  }

  const delegate = getDelegate();
  if (!delegate) {
    return {};
  }

  try {
    await ensureTranslationIntroSettings();
    const row = await delegate.findUniqueOrThrow({
      where: { id: TRANSLATION_INTRO_SETTINGS_ID },
    });
    const value = parseTranslationIntroOffsets(row.forcedOffsets);
    cachedForcedOffsets = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[translation-intro] forced offsets fallback:", error);
    return {};
  }
}

export async function getTranslationIntroStats(): Promise<TranslationIntroStatRow[]> {
  const rows = await prisma.$queryRaw<
    { name: string; contributors: bigint; avg_seconds: number | null }[]
  >`
    SELECT
      e.key AS name,
      COUNT(*) FILTER (WHERE (e.value)::int > 0)::bigint AS contributors,
      ROUND(AVG((e.value)::int) FILTER (WHERE (e.value)::int > 0))::int AS avg_seconds
    FROM "User" u,
      jsonb_each_text(COALESCE(u."siteSettings"->'translationIntroOffsets', '{}'::jsonb)) e
    GROUP BY e.key
    ORDER BY contributors DESC, name ASC
  `;

  return rows.map((row) => ({
    translationName: row.name,
    contributors: Number(row.contributors),
    avgSeconds:
      row.avg_seconds !== null && Number.isFinite(row.avg_seconds)
        ? clampTranslationIntroOffsetSec(row.avg_seconds)
        : null,
  }));
}

export async function getTranslationIntroSettingsDto(): Promise<TranslationIntroSettingsDto> {
  const delegate = getDelegate();
  if (!delegate) {
    return fallbackDto();
  }

  await ensureTranslationIntroSettings();
  const [row, stats] = await Promise.all([
    delegate.findUniqueOrThrow({ where: { id: TRANSLATION_INTRO_SETTINGS_ID } }),
    getTranslationIntroStats(),
  ]);

  return {
    forcedOffsets: parseTranslationIntroOffsets(row.forcedOffsets),
    stats,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateForcedTranslationIntroOffset(
  translationName: string,
  seconds: number,
): Promise<TranslationIntroSettingsDto> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma client не обновлён. Перезапустите dev-сервер и выполните prisma generate.");
  }

  const name = translationName.trim();
  if (!name) {
    throw new Error("Не указано название озвучки");
  }

  const clamped = clampTranslationIntroOffsetSec(seconds);

  await ensureTranslationIntroSettings();
  const current = await delegate.findUniqueOrThrow({
    where: { id: TRANSLATION_INTRO_SETTINGS_ID },
  });
  const forcedOffsets = parseTranslationIntroOffsets(current.forcedOffsets);

  if (clamped > 0) {
    forcedOffsets[name] = clamped;
  } else {
    delete forcedOffsets[name];
  }

  await delegate.update({
    where: { id: TRANSLATION_INTRO_SETTINGS_ID },
    data: { forcedOffsets },
  });

  invalidateTranslationIntroForcedCache();
  return getTranslationIntroSettingsDto();
}

export async function applyTranslationIntroOffsetToAllUsers(
  translationName: string,
  seconds: number,
): Promise<{ updatedUsers: number }> {
  const name = translationName.trim();
  if (!name) {
    throw new Error("Не указано название озвучки");
  }

  const clamped = clampTranslationIntroOffsetSec(seconds);

  const updatedUsers = await prisma.$executeRaw`
    UPDATE "User"
    SET "siteSettings" = jsonb_set(
      COALESCE("siteSettings", '{}'::jsonb),
      ARRAY['translationIntroOffsets', ${name}]::text[],
      to_jsonb(${clamped}::int),
      true
    ),
    "updatedAt" = NOW()
  `;

  if (clamped > 0) {
    await updateForcedTranslationIntroOffset(name, clamped);
  } else {
    await updateForcedTranslationIntroOffset(name, 0);
  }

  return { updatedUsers: Number(updatedUsers) };
}
