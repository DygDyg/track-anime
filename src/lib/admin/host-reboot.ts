import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isDbBackupRunning } from "@/lib/admin/db-backup";
import { getDbBackupSettingsSecrets } from "@/lib/admin/db-backup-settings";
import type { HostRebootBlocker, HostRebootStatus } from "@/lib/admin/host-reboot-types";
import { IMPORT_JOB_ID } from "@/lib/admin/import-job";
import { prisma } from "@/lib/prisma";

export type { HostRebootBlocker, HostRebootStatus } from "@/lib/admin/host-reboot-types";

const execFileAsync = promisify(execFile);

/** Как у импорта/синка: «running» без обновлений дольше этого считаем зависшим. */
const IMPORT_STALE_MS = 5 * 60 * 1000;
const SYNC_RUN_STALE_MS = 15 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __taHostRebootScheduledAt?: number | null;
};

function parseEnvFlag(raw: string | undefined): boolean | null {
  if (raw == null || !raw.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return null;
}

function isRebootEnabled(): boolean {
  const flag = parseEnvFlag(process.env.HOST_REBOOT_ENABLED);
  if (flag != null) return flag;
  // На prod (Debian) по умолчанию включено; локальный Windows — выкл.
  return process.platform === "linux";
}

function rebootDelayMinutes(): number {
  const raw = Number.parseInt(process.env.HOST_REBOOT_DELAY_MINUTES ?? "1", 10);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(60, Math.max(1, raw));
}

export async function getHostRebootBlockers(): Promise<HostRebootBlocker[]> {
  const blockers: HostRebootBlocker[] = [];

  if (await isDbBackupRunning()) {
    blockers.push({
      id: "db_backup_running",
      label: "Идёт WebDAV-бекап базы — ребут может повредить выгрузку",
    });
  }

  const backupSecrets = await getDbBackupSettingsSecrets();
  if (backupSecrets.runRequestedAt) {
    blockers.push({
      id: "db_backup_queued",
      label: "Бекап БД в очереди и скоро начнётся",
    });
  }

  const importJob = await prisma.kodikImportJob.findUnique({ where: { id: IMPORT_JOB_ID } });
  if (
    importJob?.status === "running" &&
    Date.now() - importJob.updatedAt.getTime() <= IMPORT_STALE_MS
  ) {
    const phase =
      importJob.phase === "sync"
        ? "синхронизация Kodik"
        : importJob.phase === "episodes"
          ? "импорт серий Kodik"
          : "импорт каталога Kodik";
    blockers.push({
      id: "kodik_import_job",
      label: `Сейчас выполняется ${phase}`,
    });
  }

  const syncRun = await prisma.kodikSyncRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (
    syncRun &&
    Date.now() - syncRun.startedAt.getTime() <= SYNC_RUN_STALE_MS &&
    !blockers.some((b) => b.id === "kodik_import_job")
  ) {
    blockers.push({
      id: "kodik_sync_run",
      label: "Идёт запись прогона синхронизации Kodik",
    });
  }

  return blockers;
}

export async function getHostRebootStatus(): Promise<HostRebootStatus> {
  const blockers = await getHostRebootBlockers();
  const enabled = isRebootEnabled();
  const scheduledAt = globalStore.__taHostRebootScheduledAt ?? null;
  const scheduled = scheduledAt != null && Date.now() - scheduledAt < rebootDelayMinutes() * 60_000;

  return {
    enabled,
    canReboot: enabled && blockers.length === 0 && !scheduled,
    blockers,
    platform: process.platform,
    delayMinutes: rebootDelayMinutes(),
    scheduled,
  };
}

async function runRebootCommand(delayMinutes: number): Promise<void> {
  const custom = process.env.HOST_REBOOT_COMMAND?.trim();
  if (custom) {
    if (process.platform === "win32") {
      await execFileAsync("cmd.exe", ["/d", "/s", "/c", custom], {
        timeout: 15_000,
        windowsHide: true,
      });
      return;
    }
    await execFileAsync("/bin/sh", ["-c", custom], { timeout: 15_000 });
    return;
  }

  if (process.platform === "win32") {
    const seconds = delayMinutes * 60;
    await execFileAsync(
      "shutdown",
      ["/r", "/t", String(seconds), "/c", "Track Anime admin reboot"],
      { timeout: 15_000, windowsHide: true },
    );
    return;
  }

  // -n: без пароля; нужен NOPASSWD на /sbin/shutdown (см. docs/SERVER.md)
  await execFileAsync(
    "sudo",
    ["-n", "/sbin/shutdown", "-r", `+${delayMinutes}`, "Track Anime admin reboot"],
    { timeout: 15_000 },
  );
}

export type ScheduleHostRebootResult =
  | { ok: true; message: string; delayMinutes: number }
  | { ok: false; error: string; status: number; blockers?: HostRebootBlocker[] };

export async function scheduleHostReboot(): Promise<ScheduleHostRebootResult> {
  const status = await getHostRebootStatus();

  if (!status.enabled) {
    return {
      ok: false,
      status: 403,
      error:
        "Ребут хоста выключен (HOST_REBOOT_ENABLED). На Linux по умолчанию включён; на Windows задайте HOST_REBOOT_ENABLED=1.",
    };
  }

  if (status.scheduled) {
    return {
      ok: false,
      status: 409,
      error: "Ребут уже запланирован",
    };
  }

  if (status.blockers.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Сейчас нельзя перезагружать сервер",
      blockers: status.blockers,
    };
  }

  try {
    await runRebootCommand(status.delayMinutes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 500,
      error:
        process.platform === "linux"
          ? `Не удалось запланировать ребут (нужен passwordless sudo на /sbin/shutdown): ${detail}`
          : `Не удалось запланировать ребут: ${detail}`,
    };
  }

  globalStore.__taHostRebootScheduledAt = Date.now();

  return {
    ok: true,
    delayMinutes: status.delayMinutes,
    message: `Ребут сервера запланирован через ${status.delayMinutes} мин.`,
  };
}
