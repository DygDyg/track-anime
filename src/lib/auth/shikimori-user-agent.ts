/** Должен совпадать с именем OAuth-приложения на Shikimori (User-Agent). */
export function getShikimoriUserAgent(): string {
  return (
    process.env.SHIKIMORI_APP_NAME?.trim() ||
    process.env.SHIKIMORI_USER_AGENT?.trim() ||
    "TrackAnime"
  );
}
