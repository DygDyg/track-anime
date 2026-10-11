/**
 * Kodik-style «безопасный режим»: progressive MP4 without HLS suffix / query.
 * Example: `…/720.mp4:hls:manifest.m3u8` → `…/720.mp4`
 */
export function toTaPlusSafeModeUrl(url: string | null | undefined): string | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const idx = lower.indexOf(".mp4");
  if (idx < 0) return null;
  return trimmed.slice(0, idx + ".mp4".length);
}

export function canUseTaPlusSafeMode(url: string | null | undefined): boolean {
  return toTaPlusSafeModeUrl(url) != null;
}
