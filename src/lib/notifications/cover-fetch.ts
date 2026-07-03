import { resolveNotificationPosterUrl } from "@/lib/notifications/payload";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

const COVER_FETCH_TIMEOUT_MS = 15_000;

export async function fetchNotificationCoverBuffer(
  payload: HistoryNewNotificationPayload,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const posterUrl = resolveNotificationPosterUrl(payload);

  try {
    const response = await fetch(posterUrl, {
      signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS),
      headers: { Accept: "image/*" },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return null;

    return { buffer, contentType };
  } catch (error) {
    console.error("[notifications] cover fetch failed", {
      posterUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
