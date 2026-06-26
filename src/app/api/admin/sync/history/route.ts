import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getSyncHistory } from "@/lib/admin/kodik-sync-settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  const history = await getSyncHistory(limit);
  return NextResponse.json(history);
}
