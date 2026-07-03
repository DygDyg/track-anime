import { getShikimoriScope } from "@/lib/auth/config";

export function parseShikimoriScopes(scope: string): Set<string> {
  return new Set(
    scope
      .split(/[\s+]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function hasShikimoriScope(scope: string, required: string): boolean {
  return parseShikimoriScopes(scope).has(required);
}

export function isFriendsScopeConfigured(): boolean {
  return hasShikimoriScope(getShikimoriScope(), "friends");
}

/** Токен выдан до scope friends или refresh не расширил права. */
export function needsShikimoriFriendsReconnect(accountScope: string | null | undefined): boolean {
  if (!isFriendsScopeConfigured()) return false;
  if (!accountScope?.trim()) return true;
  return !hasShikimoriScope(accountScope, "friends");
}

export const SHIKIMORI_FRIENDS_RECONNECT_URL = "/api/auth/shikimori/reconnect";

/** Scope friends не включён в SHIKIMORI_OAUTH_SCOPE (или не одобрен Shikimori для приложения). */
export const SHIKIMORI_FRIENDS_UNAVAILABLE_MESSAGE =
  "Добавление в друзья через Track Anime недоступно: scope «friends» не одобрен Shikimori для OAuth-приложения Track Anime. Запросите доступ у администратора Shikimori, затем включите scope в настройках приложения и добавьте SHIKIMORI_OAUTH_SCOPE=\"user_rates+friends\" на сервере.";

export const SHIKIMORI_FRIENDS_SCOPE_ERROR =
  "Нет доступа к друзьям Shikimori. Обновите разрешения OAuth — Shikimori попросит подтвердить доступ заново.";
