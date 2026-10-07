import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAnimeWatchShareLogDto } from "@/lib/admin/watch-share-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const data = await getAnimeWatchShareLogDto(limit);
  return NextResponse.json(data);
}
