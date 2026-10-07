/**
 * Публичный base URL для ссылок в уведомлениях (не путать с AUTH_URL / OAuth).
 */

/** GitHub Pages зеркало-роутер: выбирает живой origin и переносит path (`/anime/:id`). */
export const GITHUB_PAGES_LINK_BASE_URL = "https://track-anime.github.io";

export function authUrlFallback(): string {
  return (process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Нормализует origin[/path] без хвостового `/`. Пустая строка → null. */
export function normalizeNotificationLinkBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "Некорректный URL домена ссылок. Укажите полный адрес, например https://track-anime.dygdyg.ru",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Домен ссылок должен начинаться с http:// или https://");
  }

  if (parsed.search || parsed.hash) {
    throw new Error("Уберите query и hash из домена ссылок");
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return path && path !== "/" ? `${parsed.origin}${path}` : parsed.origin;
}

export function isGithubPagesLinkBaseUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return normalizeNotificationLinkBaseUrl(value) === GITHUB_PAGES_LINK_BASE_URL;
  } catch {
    return false;
  }
}
