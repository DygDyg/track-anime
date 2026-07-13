import { NextResponse } from "next/server";
import { getWatchPartySettingsDto } from "@/lib/admin/watch-party-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getWatchPartySettingsDto();
  return NextResponse.json({ settings });
}
