import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getShikimoriSettingsDto,
  SHIKIMORI_HOST_PRESETS,
  updateShikimoriHost,
} from "@/lib/shikimori/endpoints";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getShikimoriSettingsDto();
  return NextResponse.json({
    settings,
    presets: SHIKIMORI_HOST_PRESETS,
  });
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

  const host = (body as { host?: unknown }).host;
  if (typeof host !== "string" || !host.trim()) {
    return NextResponse.json({ error: "Укажите хост Shikimori" }, { status: 400 });
  }

  const settings = await updateShikimoriHost(host);
  return NextResponse.json({ settings, presets: SHIKIMORI_HOST_PRESETS });
}
