/** Build a multivariant HLS master playlist so hls.js can ABR across /ftor quality URLs. */

export const TA_PLUS_QUALITY_AUTO = "auto";

/**
 * Approximate peak bitrates for Kodik anime HLS ladders.
 * Slightly conservative vs “cinema” encodes so ABR does not over-demand
 * relative to real throughput (which previously pinned Auto near 480p).
 */
function estimateBandwidth(height: number): number {
  if (height >= 1080) return 4_200_000;
  if (height >= 720) return 2_200_000;
  if (height >= 480) return 1_100_000;
  return 650_000;
}

function estimateResolution(height: number): string {
  const width = Math.round((height * 16) / 9);
  return `${width}x${height}`;
}

/** Sort quality keys highest-first (1080, 720, …). */
export function sortTaPlusQualityKeys(qualities: Record<string, string>): string[] {
  return Object.keys(qualities).sort((a, b) => Number(b) - Number(a));
}

export function getTaPlusMaxQualityUrl(
  qualities: Record<string, string>,
): string | null {
  const keys = sortTaPlusQualityKeys(qualities);
  const maxKey = keys[0];
  if (!maxKey) return null;
  return qualities[maxKey] ?? null;
}

export function buildTaPlusMasterPlaylist(qualities: Record<string, string>): string | null {
  const keys = sortTaPlusQualityKeys(qualities);
  if (keys.length === 0) return null;
  if (keys.length === 1) {
    const only = qualities[keys[0]!];
    return only ?? null;
  }

  const lines = ["#EXTM3U"];
  // Lowest first in master — hls.js level index 0 = lowest; we set startLevel to max.
  for (const key of [...keys].reverse()) {
    const url = qualities[key];
    if (!url) continue;
    const height = Number(key);
    const h = Number.isFinite(height) && height > 0 ? height : 360;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${estimateBandwidth(h)},RESOLUTION=${estimateResolution(h)},NAME="${h}p"`,
    );
    lines.push(url);
  }
  return lines.length > 1 ? `${lines.join("\n")}\n` : null;
}

export function createTaPlusMasterPlaylistUrl(qualities: Record<string, string>): string | null {
  const keys = sortTaPlusQualityKeys(qualities);
  if (keys.length === 0) return null;
  if (keys.length === 1) return qualities[keys[0]!] ?? null;
  const body = buildTaPlusMasterPlaylist(qualities);
  if (!body || !body.includes("#EXTM3U")) {
    return qualities[keys[0]!] ?? null;
  }
  const blob = new Blob([body], { type: "application/vnd.apple.mpegurl" });
  return URL.createObjectURL(blob);
}
