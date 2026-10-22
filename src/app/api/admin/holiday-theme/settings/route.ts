import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getHolidayThemeSettingsDto,
  updateHolidayThemeSettings,
} from "@/lib/admin/holiday-theme-settings";
import { HOLIDAY_THEME_CATALOG } from "@/lib/holiday-theme";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getHolidayThemeSettingsDto();
  return NextResponse.json({ settings, catalog: HOLIDAY_THEME_CATALOG });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as { enabled?: unknown; windows?: unknown };
  if (input.enabled === undefined && input.windows === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
  }

  if (input.windows !== undefined && !Array.isArray(input.windows)) {
    return NextResponse.json({ error: "windows должен быть массивом" }, { status: 400 });
  }

  const settings = await updateHolidayThemeSettings({
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    windows: input.windows,
  });

  return NextResponse.json({ settings, catalog: HOLIDAY_THEME_CATALOG });
}
