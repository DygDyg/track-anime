import { NotificationSettingsPanel } from "@/components/admin/NotificationSettingsPanel";
import { getNotificationSettingsDto } from "@/lib/admin/notification-settings";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const { user } = await requireAdmin();
  const settings = await getNotificationSettingsDto();

  return <NotificationSettingsPanel initialSettings={settings} currentUserId={user.id} />;
}
