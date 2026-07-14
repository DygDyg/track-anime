import { WatchPartySettingsPanel } from "@/components/admin/WatchPartySettingsPanel";
import { getWatchPartySettingsDto } from "@/lib/admin/watch-party-settings";
import { getWatchPartyRoomsDto } from "@/lib/admin/watch-party-rooms";

export const dynamic = "force-dynamic";

export default async function AdminWatchPartyPage() {
  const [initialSettings, initialRooms] = await Promise.all([
    getWatchPartySettingsDto(),
    getWatchPartyRoomsDto(),
  ]);

  return <WatchPartySettingsPanel initialSettings={initialSettings} initialRooms={initialRooms} />;
}
