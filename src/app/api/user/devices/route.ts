import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  deleteUserDevice,
  listUserDevices,
  normalizeDeviceKey,
  normalizeDisplayName,
  renameCurrentDevice,
} from "@/lib/device-presence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const url = new URL(request.url);
  const currentDeviceKey = normalizeDeviceKey(url.searchParams.get("deviceKey"));

  try {
    const devices = await listUserDevices(session.user.id, currentDeviceKey);
    return NextResponse.json({ devices });
  } catch (error) {
    console.error("[user/devices] list failed:", error);
    return NextResponse.json({ error: "Не удалось загрузить устройства" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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

  const input = body as { deviceKey?: unknown; displayName?: unknown };
  const deviceKey = normalizeDeviceKey(input.deviceKey);
  const displayName = normalizeDisplayName(input.displayName);

  if (!deviceKey) {
    return NextResponse.json({ error: "Некорректный deviceKey" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "Укажите имя устройства" }, { status: 400 });
  }

  try {
    const device = await renameCurrentDevice(session.user.id, deviceKey, displayName);
    if (!device) {
      return NextResponse.json(
        { error: "Устройство ещё не зарегистрировано. Откройте страницу аниме." },
        { status: 404 },
      );
    }
    return NextResponse.json({ device });
  } catch (error) {
    console.error("[user/devices] rename failed:", error);
    return NextResponse.json({ error: "Не удалось переименовать устройство" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

  const deviceKey = normalizeDeviceKey((body as { deviceKey?: unknown }).deviceKey);
  if (!deviceKey) {
    return NextResponse.json({ error: "Некорректный deviceKey" }, { status: 400 });
  }

  try {
    const ok = await deleteUserDevice(session.user.id, deviceKey);
    if (!ok) {
      return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[user/devices] delete failed:", error);
    return NextResponse.json({ error: "Не удалось удалить устройство" }, { status: 500 });
  }
}
