/** Allowlist for Kodik/ftor storyboard CDN hosts (client + server). */

const ALLOWED_HOST_SUFFIXES = [
  "solodcdn.com",
  "kodik-storage.com",
  "kodik.biz",
  "kodik.info",
  "cloudstatic.ru",
];

export function isAllowedTaPlusTileUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/** Browser URL that fetches a tile sheet through our server (avoids CDN hotlink blocks). */
export function taPlusProxiedTileUrl(sheetUrl: string): string {
  const params = new URLSearchParams({ url: sheetUrl });
  return `/api/taplus-tile?${params.toString()}`;
}
