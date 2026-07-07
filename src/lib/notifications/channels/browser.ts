import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import {
  formatHistoryNewNotificationBody,
  formatHistoryNewNotificationTitle,
  resolveNotificationPosterUrl,
} from "@/lib/notifications/payload";
import { getNotificationRuntimeConfig } from "@/lib/notifications/runtime-config";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

let vapidConfigured = false;
let vapidFingerprint = "";

async function ensureVapid(): Promise<boolean> {
  const config = await getNotificationRuntimeConfig();
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;

  const fingerprint = `${config.vapidPublicKey}:${config.vapidPrivateKey}:${config.vapidSubject}`;
  if (vapidConfigured && vapidFingerprint === fingerprint) return true;

  webpush.setVapidDetails(
    config.vapidSubject ?? "mailto:admin@track-anime.local",
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
  vapidConfigured = true;
  vapidFingerprint = fingerprint;
  return true;
}

export function resetVapidClientCache(): void {
  vapidConfigured = false;
  vapidFingerprint = "";
}

export async function getVapidPublicKey(): Promise<string | null> {
  const config = await getNotificationRuntimeConfig();
  return config.vapidPublicKey;
}

export async function isWebPushRuntimeConfigured(): Promise<boolean> {
  const config = await getNotificationRuntimeConfig();
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export async function sendBrowserPushNotification(
  userId: string,
  payload: HistoryNewNotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!(await isWebPushRuntimeConfigured()) || !(await ensureVapid())) {
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const posterUrl = resolveNotificationPosterUrl(payload);
  const pushPayload = JSON.stringify({
    title: formatHistoryNewNotificationTitle(payload),
    body: formatHistoryNewNotificationBody(payload),
    url: payload.pageUrl,
    icon: posterUrl,
    image: posterUrl,
    tag: `history-new:${payload.materialId}:${payload.seasonNumber}:${payload.episodeNumber}`,
  });

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        pushPayload,
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode)
          : null;

      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
      }

      console.error("[notifications] browser push failed", {
        userId,
        endpoint: subscription.endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent, failed };
}
