import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  MAX_DEVICE_PRESENCE_TTL_HOURS,
  MIN_DEVICE_PRESENCE_TTL_HOURS,
  getDevicePresenceSettingsDto,
  updateDevicePresenceSettings,
} from "@/lib/admin/device-presence-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getDevicePresenceSettingsDto();
  return NextResponse.json({
    settings,
    minTtlHours: MIN_DEVICE_PRESENCE_TTL_HOURS,
    maxTtlHours: MAX_DEVICE_PRESENCE_TTL_HOURS,
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

  const input = body as { ttlHours?: unknown };
  if (input.ttlHours === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const ttlHours = Number(input.ttlHours);
  if (
    !Number.isInteger(ttlHours) ||
    ttlHours < MIN_DEVICE_PRESENCE_TTL_HOURS ||
    ttlHours > MAX_DEVICE_PRESENCE_TTL_HOURS
  ) {
    return NextResponse.json(
      {
        error: `ttlHours: от ${MIN_DEVICE_PRESENCE_TTL_HOURS} до ${MAX_DEVICE_PRESENCE_TTL_HOURS}`,
      },
      { status: 400 },
    );
  }

  const settings = await updateDevicePresenceSettings({ ttlHours });
  return NextResponse.json({ settings });
}
