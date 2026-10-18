import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  isDevicePresenceClientKind,
  normalizeDeviceKey,
  normalizeLastPath,
  normalizeLastTitle,
  upsertDevicePresence,
} from "@/lib/device-presence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as {
    deviceKey?: unknown;
    clientKind?: unknown;
    lastPath?: unknown;
    lastTitle?: unknown;
    displayName?: unknown;
  };

  const deviceKey = normalizeDeviceKey(input.deviceKey);
  if (!deviceKey) {
    return NextResponse.json({ error: "Некорректный deviceKey" }, { status: 400 });
  }

  if (!isDevicePresenceClientKind(input.clientKind)) {
    return NextResponse.json({ error: "Некорректный clientKind" }, { status: 400 });
  }

  const lastPath = normalizeLastPath(input.lastPath);
  if (!lastPath) {
    return NextResponse.json({ error: "Некорректный lastPath" }, { status: 400 });
  }

  try {
    const device = await upsertDevicePresence(session.user.id, {
      deviceKey,
      clientKind: input.clientKind,
      lastPath,
      lastTitle: normalizeLastTitle(input.lastTitle),
      displayName: typeof input.displayName === "string" ? input.displayName : null,
    });
    return NextResponse.json({ device });
  } catch (error) {
    console.error("[user/devices/presence] upsert failed:", error);
    return NextResponse.json({ error: "Не удалось сохранить устройство" }, { status: 500 });
  }
}
