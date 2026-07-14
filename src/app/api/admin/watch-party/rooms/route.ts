import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getWatchPartyRoomsDto } from "@/lib/admin/watch-party-rooms";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const rooms = await getWatchPartyRoomsDto();
  return NextResponse.json({ rooms });
}
