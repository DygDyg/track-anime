import { NextResponse } from "next/server";
import { checkPlayerProxy } from "@/lib/admin/player-proxy-check";
import {
  PlayerProxySettingsError,
  resolvePlayerProxyUrlForCheck,
} from "@/lib/admin/player-proxy-settings";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
    }
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as { proxyUrl?: unknown; password?: unknown };
  if (input.proxyUrl !== undefined && typeof input.proxyUrl !== "string") {
    return NextResponse.json({ error: "proxyUrl должен быть строкой" }, { status: 400 });
  }
  if (input.password !== undefined && typeof input.password !== "string") {
    return NextResponse.json({ error: "password должен быть строкой" }, { status: 400 });
  }

  try {
    const proxyUrl = await resolvePlayerProxyUrlForCheck({
      proxyUrl: typeof input.proxyUrl === "string" ? input.proxyUrl : undefined,
      password: typeof input.password === "string" ? input.password : undefined,
    });
    const check = await checkPlayerProxy(proxyUrl);
    return NextResponse.json({ check });
  } catch (error) {
    if (error instanceof PlayerProxySettingsError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[player-proxy] check", error instanceof Error ? error.message : "failed");
    return NextResponse.json({ error: "Не удалось проверить прокси" }, { status: 500 });
  }
}
