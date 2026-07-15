import { NextResponse } from "next/server";
import { getWatchPartyRoomsDto } from "@/lib/admin/watch-party-rooms";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const data = await getWatchPartyRoomsDto();
  return NextResponse.json(data);
}
