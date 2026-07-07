import { AdminSiteSettingsDefaultsPanel } from "@/components/admin/AdminSiteSettingsDefaultsPanel";
import { getSiteSettingsDefaultsDto } from "@/lib/admin/site-settings-defaults";

export const dynamic = "force-dynamic";

export default async function AdminSiteSettingsPage() {
  const initialData = await getSiteSettingsDefaultsDto();

  return <AdminSiteSettingsDefaultsPanel initialData={initialData} />;
}
