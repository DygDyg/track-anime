import "server-only";

import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import {
  formatHistoryNewNotificationBody,
  formatHistoryNewNotificationTitle,
} from "@/lib/notifications/payload";
import { prisma } from "@/lib/prisma";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

type FcmServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let authClient: GoogleAuth | null = null;
let cachedProjectId: string | null = null;

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function readServiceAccountFromEnv(): FcmServiceAccount | null {
  const filePath = process.env.FCM_SERVICE_ACCOUNT_FILE?.trim();
  if (filePath) {
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as FcmServiceAccount;
    } catch (error) {
      console.error("[notifications] FCM_SERVICE_ACCOUNT_FILE read failed", error);
      return null;
    }
  }

  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: normalizePrivateKey(privateKey),
  };
}

export function isFcmRuntimeConfigured(): boolean {
  const account = readServiceAccountFromEnv();
  return Boolean(account?.project_id && account.client_email && account.private_key);
}

function getGoogleAuth(): { auth: GoogleAuth; projectId: string } | null {
  const account = readServiceAccountFromEnv();
  if (!account?.project_id || !account.client_email || !account.private_key) return null;

  if (!authClient || cachedProjectId !== account.project_id) {
    authClient = new GoogleAuth({
      credentials: {
        client_email: account.client_email,
        private_key: normalizePrivateKey(account.private_key),
      },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
      projectId: account.project_id,
    });
    cachedProjectId = account.project_id;
  }

  return { auth: authClient, projectId: account.project_id };
}

export function resetFcmClientCache(): void {
  authClient = null;
  cachedProjectId = null;
}

async function getAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const configured = getGoogleAuth();
  if (!configured) return null;
  const client = await configured.auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) return null;
  return { token, projectId: configured.projectId };
}

function isInvalidTokenError(status: number, body: string): boolean {
  if (status === 404) return true;
  return /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(body);
}

export async function sendFcmPushNotification(
  userId: string,
  payload: HistoryNewNotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!isFcmRuntimeConfigured()) {
    return { sent: 0, failed: 0 };
  }

  const access = await getAccessToken();
  if (!access) {
    return { sent: 0, failed: 0 };
  }

  const tokens = await prisma.fcmDeviceToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const title = formatHistoryNewNotificationTitle(payload);
  const body = formatHistoryNewNotificationBody(payload);
  const tag = `history-new:${payload.materialId}:${payload.seasonNumber}:${payload.episodeNumber}`;
  const pageUrl = payload.pageUrl.startsWith("http")
    ? payload.pageUrl
    : `https://track-anime.dygdyg.ru${payload.pageUrl.startsWith("/") ? "" : "/"}${payload.pageUrl}`;

  let sent = 0;
  let failed = 0;

  for (const row of tokens) {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${access.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access.token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            message: {
              token: row.token,
              data: {
                title,
                body,
                url: pageUrl,
                tag,
              },
              android: {
                priority: "HIGH",
              },
            },
          }),
        },
      );

      if (response.ok) {
        sent += 1;
        continue;
      }

      failed += 1;
      const errorText = await response.text().catch(() => "");
      if (isInvalidTokenError(response.status, errorText)) {
        await prisma.fcmDeviceToken.delete({ where: { id: row.id } }).catch(() => {});
      }
      console.error("[notifications] FCM push failed", {
        userId,
        status: response.status,
        error: errorText.slice(0, 500),
      });
    } catch (error) {
      failed += 1;
      console.error("[notifications] FCM push error", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent, failed };
}
