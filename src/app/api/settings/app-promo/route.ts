import { NextResponse } from "next/server";
import { getAppPromoSettingsDto } from "@/lib/admin/app-promo-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAppPromoSettingsDto();
  return NextResponse.json({
    settings: {
      enabled: settings.enabled,
      desktopEnabled: settings.desktopEnabled,
    },
  });
}
