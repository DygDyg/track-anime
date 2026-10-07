import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getDbBackupHistory, runDbBackup } from "@/lib/admin/db-backup";
import { getDbBackupSettingsDto, requestDbBackupRun } from "@/lib/admin/db-backup-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const history = await getDbBackupHistory(30);
  return NextResponse.json(history);
}

/**
 * Запуск бекапа.
 * body.mode = "now" (по умолчанию) — выполнить сразу;
 * body.mode = "queue" — поставить флаг, cron подхватит в течение минуты.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let mode: "now" | "queue" = "now";
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (body?.mode === "queue") mode = "queue";
  } catch {
    /* empty body OK */
  }

  if (mode === "queue") {
    const settings = await requestDbBackupRun();
    return NextResponse.json({
      queued: true,
      message: "Бекап поставлен в очередь — cron подхватит в течение минуты.",
      settings,
    });
  }

  try {
    const result = await runDbBackup({ trigger: "manual", skipIfRunning: true });
    if (result.skipped) {
      return NextResponse.json(
        { error: "Бекап уже выполняется", reason: result.reason },
        { status: 409 },
      );
    }
    const history = await getDbBackupHistory(30);
    const settings = await getDbBackupSettingsDto();
    return NextResponse.json({
      message: `Бекап готов: ${result.tablesDone} таблиц, ${result.uploadedFiles} файлов → ${result.remoteFolder}`,
      result,
      history,
      settings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка бекапа";
    const history = await getDbBackupHistory(30);
    return NextResponse.json({ error: message, history }, { status: 500 });
  }
}
