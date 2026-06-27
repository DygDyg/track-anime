/** Подпись раздела сайта для Discord Rich Presence */
export function resolveDiscordSitePageLabel(pathname: string): string {
  if (pathname === "/") return "Главная";
  if (pathname.startsWith("/calendar")) return "Календарь";
  if (pathname.startsWith("/history")) return "История";
  if (pathname.startsWith("/favorites")) return "Избранное";
  if (pathname.startsWith("/search")) return "Поиск";
  if (pathname.startsWith("/profile")) return "Профиль";
  if (pathname === "/user") return "Пользователи";
  if (pathname.startsWith("/players")) return "Пользователи";
  if (pathname.startsWith("/login")) return "Вход";
  if (/^\/anime\/\d+/.test(pathname)) return "Просмотр";
  if (pathname.startsWith("/user/")) return "Профиль пользователя";
  if (pathname.startsWith("/admin")) return "Админка";
  return "Track Anime";
}

export function isAnimeWatchPath(pathname: string): boolean {
  return /^\/anime\/\d+/.test(pathname);
}

export function buildDiscordPageUrl(pathname: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${pathname}`;
}
