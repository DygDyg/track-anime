import { PlayerProxySettingsPanel } from "@/components/admin/PlayerProxySettingsPanel";
import { getPlayerProxySettingsDto } from "@/lib/admin/player-proxy-settings";

export const dynamic = "force-dynamic";

export default async function AdminPlayerProxyPage() {
  const initialSettings = await getPlayerProxySettingsDto();
  return <PlayerProxySettingsPanel initialSettings={initialSettings} />;
}
