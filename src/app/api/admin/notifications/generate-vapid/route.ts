import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getNotificationSettingsDto,
  invalidateNotificationSettingsCache,
  updateNotificationSettings,
} from "@/lib/admin/notification-settings";
import { resetVapidClientCache } from "@/lib/notifications/channels/browser";
import { generateVapidKeyPair } from "@/lib/notifications/vapid-keys";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const keys = generateVapidKeyPair();

  try {
    await updateNotificationSettings({
      vapidPublicKey: keys.publicKey,
      vapidPrivateKey: keys.privateKey,
    });
    invalidateNotificationSettingsCache();
    resetVapidClientCache();

    const settings = await getNotificationSettingsDto();
    return NextResponse.json({
      settings,
      publicKey: keys.publicKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить ключи";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
