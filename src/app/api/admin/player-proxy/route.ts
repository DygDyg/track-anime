import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getPlayerProxySettingsDto,
  PlayerProxySettingsError,
  updatePlayerProxySettings,
} from "@/lib/admin/player-proxy-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getPlayerProxySettingsDto();
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

  const input = body as { enabled?: unknown; proxyUrl?: unknown; password?: unknown };
  const patch: { enabled?: boolean; proxyUrl?: string; password?: string } = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }
  if (input.proxyUrl !== undefined) {
    if (typeof input.proxyUrl !== "string") {
      return NextResponse.json({ error: "proxyUrl должен быть строкой" }, { status: 400 });
    }
    patch.proxyUrl = input.proxyUrl;
  }
  if (input.password !== undefined) {
    if (typeof input.password !== "string") {
      return NextResponse.json({ error: "password должен быть строкой" }, { status: 400 });
    }
    patch.password = input.password;
  }

  if (patch.enabled === undefined && patch.proxyUrl === undefined && patch.password === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  try {
    const settings = await updatePlayerProxySettings(patch);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof PlayerProxySettingsError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[player-proxy] update", error);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
