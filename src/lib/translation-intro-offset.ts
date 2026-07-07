export const TRANSLATION_INTRO_OFFSET_MIN_SEC = 0;
export const TRANSLATION_INTRO_OFFSET_MAX_SEC = 30;
export const TRANSLATION_INTRO_OFFSET_STEP_SEC = 1;

export type TranslationIntroOffsets = Record<string, number>;

export type IntroResume = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function clampTranslationIntroOffsetSec(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    TRANSLATION_INTRO_OFFSET_MAX_SEC,
    Math.max(TRANSLATION_INTRO_OFFSET_MIN_SEC, Math.round(value)),
  );
}

export function parseTranslationIntroOffsets(value: unknown): TranslationIntroOffsets {
  if (!isRecord(value)) return {};

  const result: TranslationIntroOffsets = {};
  for (const [name, raw] of Object.entries(value)) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(parsed)) continue;
    const clamped = clampTranslationIntroOffsetSec(parsed);
    if (clamped > 0) {
      result[trimmed] = clamped;
    }
  }
  return result;
}

export function resolveTranslationIntroOffsetSec(
  translationTitle: string,
  userOffsets: TranslationIntroOffsets,
  forcedOffsets: TranslationIntroOffsets,
): number {
  const name = translationTitle.trim();
  if (!name) return 0;
  const forced = forcedOffsets[name];
  if (forced !== undefined && forced > 0) return forced;
  const user = userOffsets[name];
  if (user !== undefined && user > 0) return user;
  return 0;
}

export function adjustPlaybackPositionSeconds(
  positionSeconds: number,
  fromTranslationTitle: string,
  toTranslationTitle: string,
  userOffsets: TranslationIntroOffsets,
  forcedOffsets: TranslationIntroOffsets,
): number {
  if (!Number.isFinite(positionSeconds)) return 0;

  const off1 = resolveTranslationIntroOffsetSec(fromTranslationTitle, userOffsets, forcedOffsets);
  const off2 = resolveTranslationIntroOffsetSec(toTranslationTitle, userOffsets, forcedOffsets);

  let next = positionSeconds + (off2 - off1);
  if (next < 0) next = 0;
  if (off2 > 0 && next < off2) next = off2;
  return next;
}

export function applyIntroOffset<T extends IntroResume>(
  resume: T,
  fromTranslationTitle: string,
  toTranslationTitle: string,
  userOffsets: TranslationIntroOffsets,
  forcedOffsets: TranslationIntroOffsets,
): T {
  const positionSeconds = adjustPlaybackPositionSeconds(
    resume.positionSeconds,
    fromTranslationTitle,
    toTranslationTitle,
    userOffsets,
    forcedOffsets,
  );
  if (positionSeconds === resume.positionSeconds) return resume;
  return { ...resume, positionSeconds };
}
