import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { runKodikEpisodesImport } from "@/lib/admin/kodik-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  try {
    const result = await runKodikEpisodesImport({
      maxDurationMs: 280_000,
    });

    const message =
      result.pending === 0
        ? `Импорт завершён: ${result.processed} материалов, ${result.newEpisodes} серий.`
        : `Обработано ${result.processed}, пропущено ${result.skipped}, осталось ${result.pending}. Нажмите снова для продолжения.`;

    return NextResponse.json({ message, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
