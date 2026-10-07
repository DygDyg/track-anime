/** Клиент и сервер: коды/тексты протухшей связи с Shikimori (не TA-сессия). */

export const SHIKIMORI_AUTH_ERROR_CODE = "shikimori_auth";

export const SHIKIMORI_RELOGIN_MESSAGE =
  "Связь с Shikimori истекла — переподключите";

/** Старый текст в UserListSync.lastSyncError — тоже считаем auth. */
const LEGACY_SHIKIMORI_AUTH_MESSAGES = [
  "Не удалось авторизоваться в Shikimori",
  "Сессия Shikimori истекла — войдите заново",
] as const;

export function isShikimoriAuthErrorPayload(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  const value = error.trim();
  if (value === SHIKIMORI_AUTH_ERROR_CODE) return true;
  if (value === SHIKIMORI_RELOGIN_MESSAGE) return true;
  return (LEGACY_SHIKIMORI_AUTH_MESSAGES as readonly string[]).includes(value);
}
