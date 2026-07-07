import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getShikimoriAnonsSyncStatus,
  runShikimoriAnonsSync,
} from "@/lib/admin/shikimori-anons-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const status = await getShikimoriAnonsSyncStatus();
  return NextResponse.json({ status });
}

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  try {
    const result = await runShikimoriAnonsSync();
    revalidateTag("calendar", "max");

    const status = await getShikimoriAnonsSyncStatus();

    return NextResponse.json({
      message: `Анонсы Shikimori: всего ${result.total}, обновлено ${result.upserted}, удалено ${result.removed}.`,
      ...result,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
