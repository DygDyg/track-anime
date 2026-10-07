import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  COVER_REFRESH_RECENT_DEFAULT_DAYS,
  listRecentReleaseShikimoriIds,
} from "@/lib/admin/cover-cache-refresh-recent";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let days = COVER_REFRESH_RECENT_DEFAULT_DAYS;
  const url = new URL(request.url);
  const daysRaw = url.searchParams.get("days");
  if (daysRaw) {
    const parsed = Number(daysRaw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json({ error: "days: целое число ≥ 1" }, { status: 400 });
    }
    days = parsed;
  }

  const shikimoriIds = await listRecentReleaseShikimoriIds(days);

  return NextResponse.json({
    days,
    shikimoriIds,
    candidates: shikimoriIds.length,
  });
}
