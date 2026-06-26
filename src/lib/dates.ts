export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toIsoString(value: Date | string): string {
  return toDate(value).toISOString();
}
