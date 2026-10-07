import { getAlternateKeyboardLayoutQuery } from "@/lib/keyboard-layout";

const FUZZY_MIN_TOKEN_LENGTH = 3;

export function normalizeMatchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fuzzyDistanceLimit(length: number): number {
  if (length >= 10) return 3;
  if (length >= 7) return 2;
  if (length >= FUZZY_MIN_TOKEN_LENGTH) return 1;
  return 0;
}

function levenshteinWithin(a: string, b: string, maxDistance: number): number | null {
  if (Math.abs(a.length - b.length) > maxDistance) return null;
  if (a === b) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0]!;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) return null;
    [previous, current] = [current, previous];
  }

  const distance = previous[b.length]!;
  return distance <= maxDistance ? distance : null;
}

function tokenMatches(queryToken: string, haystackTokens: string[]): boolean {
  for (const token of haystackTokens) {
    if (token.includes(queryToken) || queryToken.includes(token)) return true;
    const limit = fuzzyDistanceLimit(Math.min(queryToken.length, token.length));
    if (limit <= 0) continue;
    if (levenshteinWithin(queryToken, token, limit) !== null) return true;
  }
  return false;
}

function fuzzyTokensMatch(normalizedQuery: string, normalizedHaystack: string): boolean {
  const queryTokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length >= FUZZY_MIN_TOKEN_LENGTH);
  if (queryTokens.length === 0) return false;

  const haystackTokens = normalizedHaystack.split(" ").filter(Boolean);
  if (haystackTokens.length === 0) return false;

  return queryTokens.every((token) => tokenMatches(token, haystackTokens));
}

function plainMatch(normalizedQuery: string, normalizedHaystack: string): boolean {
  if (!normalizedQuery) return true;
  if (!normalizedHaystack) return false;
  return (
    normalizedHaystack.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedHaystack) ||
    fuzzyTokensMatch(normalizedQuery, normalizedHaystack)
  );
}

/**
 * Неточный поиск: регистр/ё, раскладка QWERTY↔ЙЦУКЕН, опечатки по токенам.
 * Пустой query → true.
 */
export function matchesFuzzyText(query: string, haystack: string): boolean {
  const normalizedQuery = normalizeMatchText(query);
  if (!normalizedQuery) return true;

  const normalizedHaystack = normalizeMatchText(haystack);
  if (plainMatch(normalizedQuery, normalizedHaystack)) return true;

  const alternate = getAlternateKeyboardLayoutQuery(query);
  if (!alternate) return false;

  const normalizedAlt = normalizeMatchText(alternate);
  if (!normalizedAlt || normalizedAlt === normalizedQuery) return false;
  return plainMatch(normalizedAlt, normalizedHaystack);
}
