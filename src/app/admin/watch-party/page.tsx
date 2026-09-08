import { WatchPartySettingsPanel } from "@/components/admin/WatchPartySettingsPanel";
import { getWatchPartyHistoryDto } from "@/lib/admin/watch-party-history";
import { getWatchPartySettingsDto } from "@/lib/admin/watch-party-settings";

export const dynamic = "force-dynamic";

export default async function AdminWatchPartyPage() {
  const [initialSettings, initialHistory] = await Promise.all([
    getWatchPartySettingsDto(),
    getWatchPartyHistoryDto(50),
  ]);

  return (
    <WatchPartySettingsPanel initialSettings={initialSettings} initialHistory={initialHistory} />
  );
}
