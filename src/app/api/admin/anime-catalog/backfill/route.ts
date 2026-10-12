import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getAnimeCatalogBackfillStatus } from "@/lib/anime-catalog-backfill";

export const dynamic = "force-dynamic";

/** Статус backfill каталога (для админки / мониторинга). */
export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const status = await getAnimeCatalogBackfillStatus();
  return NextResponse.json(status);
}
