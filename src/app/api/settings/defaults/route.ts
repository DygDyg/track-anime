import { NextResponse } from "next/server";
import { getSiteSettingsDefaults } from "@/lib/admin/site-settings-defaults";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSiteSettingsDefaults();
  return NextResponse.json({ settings });
}
