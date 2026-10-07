import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getAppPromoSettingsDto,
  updateAppPromoSettings,
} from "@/lib/admin/app-promo-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getAppPromoSettingsDto();
  return NextResponse.json({ settings });
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

  const input = body as { enabled?: unknown; desktopEnabled?: unknown };
  const patch: { enabled?: boolean; desktopEnabled?: boolean } = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }

  if (input.desktopEnabled !== undefined) {
    if (typeof input.desktopEnabled !== "boolean") {
      return NextResponse.json({ error: "desktopEnabled должен быть boolean" }, { status: 400 });
    }
    patch.desktopEnabled = input.desktopEnabled;
  }

  if (patch.enabled === undefined && patch.desktopEnabled === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const settings = await updateAppPromoSettings(patch);
  return NextResponse.json({ settings });
}
