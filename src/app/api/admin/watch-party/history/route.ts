import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getWatchPartyHistoryDto } from "@/lib/admin/watch-party-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

  const history = await getWatchPartyHistoryDto(limit);
  return NextResponse.json(history);
}
