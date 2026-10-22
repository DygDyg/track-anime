import { NextResponse } from "next/server";
import { getHolidayThemePublicConfig } from "@/lib/admin/holiday-theme-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public: active holiday + windows (Moscow calendar from admin). */
export async function GET() {
  const config = await getHolidayThemePublicConfig();
  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    },
  });
}
