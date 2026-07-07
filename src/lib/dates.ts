export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toIsoString(value: Date | string): string {
  return toDate(value).toISOString();
}

const DAYS_PER_MONTH = 30;
const MONTHS_THRESHOLD_DAYS = 1.5 * DAYS_PER_MONTH;
const DAYS_PER_YEAR = 365;

function formatMonthsLabel(days: number): string {
  const months = days / DAYS_PER_MONTH;
  const rounded = Math.round(months * 2) / 2;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1).replace(".", ",");
}

function formatLongSpan(days: number, future: boolean): string {
  if (days < MONTHS_THRESHOLD_DAYS) {
    const value = `${days} дн.`;
    return future ? `через ${value}` : `${value} назад`;
  }

  if (days < DAYS_PER_YEAR) {
    const value = `${formatMonthsLabel(days)} мес.`;
    return future ? `через ${value}` : `${value} назад`;
  }

  const years = Math.floor(days / DAYS_PER_YEAR);
  const value = `${years} г.`;
  return future ? `через ${value}` : `${value} назад`;
}

export function formatRelativeRu(date: Date | string, now = Date.now()): string {
  const time = toDate(date).getTime();
  const diffMs = now - time;
  const absMinutes = Math.floor(Math.abs(diffMs) / 60000);

  if (absMinutes < 1) return "только что";

  if (diffMs < 0) {
    if (absMinutes < 60) return `через ${absMinutes} мин.`;
    const hours = Math.floor(absMinutes / 60);
    if (hours < 24) return `через ${hours} ч.`;
    const days = Math.floor(hours / 24);
    return formatLongSpan(days, true);
  }

  if (absMinutes < 60) return `${absMinutes} мин. назад`;
  const hours = Math.floor(absMinutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  return formatLongSpan(days, false);
}
