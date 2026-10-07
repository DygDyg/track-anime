import { runDbBackup } from "@/lib/admin/db-backup";
import {
  ensureDbBackupSettings,
  getDbBackupSettingsSecrets,
} from "@/lib/admin/db-backup-settings";

export type ScheduledDbBackupResult =
  | { action: "disabled" }
  | { action: "not_configured" }
  | { action: "waiting"; hoursLeft: number }
  | { action: "skipped"; reason: string }
  | {
      action: "ran";
      trigger: "auto" | "requested";
      uploadedFiles: number;
      uploadedBytes: number;
      tablesDone: number;
      remoteFolder: string;
    };

export async function maybeRunScheduledDbBackup(): Promise<ScheduledDbBackupResult> {
  await ensureDbBackupSettings();
  const secrets = await getDbBackupSettingsSecrets();

  const requested = Boolean(secrets.runRequestedAt);
  if (!requested && !secrets.enabled) {
    return { action: "disabled" };
  }

  if (!secrets.webdavUrl.trim() || !secrets.webdavUsername.trim() || !secrets.webdavPassword) {
    return { action: "not_configured" };
  }

  if (!requested && secrets.enabled) {
    const now = Date.now();
    const lastRunMs = secrets.lastAutoRunAt ? secrets.lastAutoRunAt.getTime() : 0;
    const intervalMs = secrets.intervalHours * 60 * 60 * 1000;
    if (lastRunMs > 0 && now - lastRunMs < intervalMs) {
      const hoursLeft = Math.ceil((intervalMs - (now - lastRunMs)) / (60 * 60 * 1000));
      return { action: "waiting", hoursLeft };
    }
  }

  const trigger = requested ? "requested" : "auto";
  const result = await runDbBackup({ trigger, skipIfRunning: true });

  if (result.skipped) {
    return { action: "skipped", reason: result.reason };
  }

  return {
    action: "ran",
    trigger,
    uploadedFiles: result.uploadedFiles,
    uploadedBytes: result.uploadedBytes,
    tablesDone: result.tablesDone,
    remoteFolder: result.remoteFolder,
  };
}
