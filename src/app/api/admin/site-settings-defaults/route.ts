import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getSiteSettingsDefaultsDto,
  updateSiteSettingsDefaults,
} from "@/lib/admin/site-settings-defaults";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const data = await getSiteSettingsDefaultsDto();
  return NextResponse.json(data);
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

  const input = body as { settings?: unknown };
  if (input.settings === undefined) {
    return NextResponse.json({ error: "Поле settings обязательно" }, { status: 400 });
  }

  const data = await updateSiteSettingsDefaults(input.settings);
  return NextResponse.json(data);
}
