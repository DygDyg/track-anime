import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getSyncSettings,
  SYNC_INTERVAL_OPTIONS,
  updateSyncSettings,
} from "@/lib/admin/kodik-sync-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getSyncSettings();
  return NextResponse.json({
    settings,
    intervalOptions: SYNC_INTERVAL_OPTIONS,
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

  const input = body as {
    enabled?: unknown;
    intervalMinutes?: unknown;
    syncPages?: unknown;
  };

  const patch: {
    enabled?: boolean;
    intervalMinutes?: number;
    syncPages?: number;
  } = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }

  if (input.intervalMinutes !== undefined) {
    const intervalMinutes = Number(input.intervalMinutes);
    if (
      !Number.isInteger(intervalMinutes) ||
      !(SYNC_INTERVAL_OPTIONS as readonly number[]).includes(intervalMinutes)
    ) {
      return NextResponse.json(
        { error: `intervalMinutes: одно из ${SYNC_INTERVAL_OPTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    patch.intervalMinutes = intervalMinutes;
  }

  if (input.syncPages !== undefined) {
    const syncPages = Number(input.syncPages);
    if (!Number.isInteger(syncPages) || syncPages < 1 || syncPages > 10) {
      return NextResponse.json({ error: "syncPages: от 1 до 10" }, { status: 400 });
    }
    patch.syncPages = syncPages;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const settings = await updateSyncSettings(patch);
  return NextResponse.json({ settings });
}
