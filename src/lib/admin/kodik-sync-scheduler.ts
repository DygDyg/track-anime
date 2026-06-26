import { runKodikIncrementalSync } from "@/lib/admin/kodik-sync";
import { ensureSyncSettings, getSyncSettings } from "@/lib/admin/kodik-sync-settings";

export type ScheduledSyncResult =
  | { action: "disabled" }
  | { action: "waiting"; minutesLeft: number }
  | { action: "skipped"; reason: string }
  | {
      action: "ran";
      updatedMaterials: number;
      newReleases: number;
      checkedMaterials: number;
    };

export async function maybeRunScheduledSync(): Promise<ScheduledSyncResult> {
  await ensureSyncSettings();
  const settings = await getSyncSettings();

  if (!settings.enabled) {
    return { action: "disabled" };
  }

  const now = Date.now();
  const lastRunMs = settings.lastAutoRunAt
    ? new Date(settings.lastAutoRunAt).getTime()
    : 0;
  const intervalMs = settings.intervalMinutes * 60 * 1000;

  if (lastRunMs > 0 && now - lastRunMs < intervalMs) {
    const minutesLeft = Math.ceil((intervalMs - (now - lastRunMs)) / 60_000);
    return { action: "waiting", minutesLeft };
  }

  const result = await runKodikIncrementalSync({
    trigger: "auto",
    skipIfRunning: true,
    syncPages: settings.syncPages,
  });

  if (result.skipped) {
    return { action: "skipped", reason: result.skipReason ?? "unknown" };
  }

  return {
    action: "ran",
    updatedMaterials: result.updatedMaterials,
    newReleases: result.newReleases,
    checkedMaterials: result.checkedMaterials,
  };
}
