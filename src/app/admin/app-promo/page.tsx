import { AppPromoSettingsPanel } from "@/components/admin/AppPromoSettingsPanel";
import { getAppPromoSettingsDto } from "@/lib/admin/app-promo-settings";

export const dynamic = "force-dynamic";

export default async function AdminAppPromoPage() {
  const initialSettings = await getAppPromoSettingsDto();
  return <AppPromoSettingsPanel initialSettings={initialSettings} />;
}
