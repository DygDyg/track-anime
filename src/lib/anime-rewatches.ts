const REWATCH_LIST_STATUSES = new Set(["completed", "rewatching"]);

export function showsRewatchCount(listStatus: string | null | undefined): boolean {
  return Boolean(listStatus && REWATCH_LIST_STATUSES.has(listStatus));
}

/** Для «Просмотрено» минимум 1, если в Shikimori ещё 0. */
export function effectiveRewatches(
  rewatches: number | null | undefined,
  listStatus: string | null | undefined,
): number {
  const value = Math.max(0, Math.floor(Number(rewatches) || 0));
  if (listStatus === "completed" || listStatus === "rewatching") {
    return Math.max(value, 1);
  }
  return value;
}

export function normalizeRewatchesInput(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const value = Math.floor(raw);
  if (value < 1 || value > 999) return null;
  return value;
}

export function formatRewatchCount(count: number): string {
  return formatRewatchTimesLabel(count);
}

/** «1 раз», «2 раза», «5 раз» — для подписей на карточках и кнопках. */
export function formatRewatchTimesLabel(count: number): string {
  const value = Math.max(1, Math.floor(count));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} раз`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} раза`;
  return `${value} раз`;
}

/** «Пересмотрено 2 раза» — для кнопок и бейджей. */
export function formatRewatchedLabel(count: number): string {
  return `Пересмотрено ${formatRewatchTimesLabel(count)}`;
}

export const REWATCH_TIMES_HINT =
  "Сколько раз вы смотрели это аниме целиком (пересмотры). Не меняет дату на Shikimori.";
