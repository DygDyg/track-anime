import { WatchPartySettingsPanel } from "@/components/admin/WatchPartySettingsPanel";
import { getWatchPartySettingsDto } from "@/lib/admin/watch-party-settings";

export const dynamic = "force-dynamic";

export default async function AdminWatchPartyPage() {
  const initialSettings = await getWatchPartySettingsDto();

  return <WatchPartySettingsPanel initialSettings={initialSettings} />;
}
