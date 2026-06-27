import { DiscordSettingsPanel } from "@/components/admin/DiscordSettingsPanel";
import { getDiscordSettingsDto } from "@/lib/discord-settings";

export const dynamic = "force-dynamic";

export default async function AdminDiscordPage() {
  const settings = await getDiscordSettingsDto();

  return <DiscordSettingsPanel initialSettings={settings} />;
}
