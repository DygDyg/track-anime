/** Общие browser-cookie для apex / www / mirror на track-anime.win. */
export const SHARED_SITE_COOKIE_DOMAIN = ".track-anime.win";

/** Domain только на *.track-anime.win (duckdns/legacy остаются host-only). */
export function sharedSiteCookieDomainForHost(hostname: string | null | undefined): string | undefined {
  if (!hostname) return undefined;
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";
  if (host === "track-anime.win" || host.endsWith(".track-anime.win")) {
    return SHARED_SITE_COOKIE_DOMAIN;
  }
  return undefined;
}
