/** Origins for Next.js allowedDevOrigins (LAN / local hostnames in dev). */
const DEFAULT_DEV_ALLOWED_ORIGINS = [
  "track-anime.dygdyg.ru",
  "dygdyg.ru",
  "dygdyg",
  "192.168.*.*",
  "10.*.*.*",
  "172.*.*.*",
];

export function getDevAllowedOrigins() {
  const extra = process.env.DEV_ALLOWED_ORIGINS?.split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return [...DEFAULT_DEV_ALLOWED_ORIGINS, ...(extra ?? [])];
}
