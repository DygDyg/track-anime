import { WatchHistorySettingsPanel } from "@/components/admin/WatchHistorySettingsPanel";
import {
  MAX_COMPLETE_EPISODE_THRESHOLD_PCT,
  MIN_COMPLETE_EPISODE_THRESHOLD_PCT,
  getWatchHistorySettingsDto,
} from "@/lib/admin/watch-history-settings";

export const dynamic = "force-dynamic";

export default async function AdminWatchHistoryPage() {
  const settings = await getWatchHistorySettingsDto();

  return (
    <WatchHistorySettingsPanel
      initialSettings={settings}
      minThresholdPct={MIN_COMPLETE_EPISODE_THRESHOLD_PCT}
      maxThresholdPct={MAX_COMPLETE_EPISODE_THRESHOLD_PCT}
    />
  );
}
