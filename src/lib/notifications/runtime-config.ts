import {
  getNotificationSettingsSecrets,
  invalidateNotificationSettingsCache,
} from "@/lib/admin/notification-settings";

export type NotificationRuntimeConfig = Awaited<
  ReturnType<typeof getNotificationSettingsSecrets>
>;

export async function getNotificationRuntimeConfig(): Promise<NotificationRuntimeConfig> {
  return getNotificationSettingsSecrets();
}

export function resetBrowserPushVapidCache(): void {
  invalidateNotificationSettingsCache();
}
