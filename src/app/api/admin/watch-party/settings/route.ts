import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getWatchPartySettingsDto,
  updateWatchPartySettings,
} from "@/lib/admin/watch-party-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getWatchPartySettingsDto();
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

  const input = body as { enabled?: unknown; allowGuests?: unknown };
  const patch: { enabled?: boolean; allowGuests?: boolean } = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }

  if (input.allowGuests !== undefined) {
    if (typeof input.allowGuests !== "boolean") {
      return NextResponse.json({ error: "allowGuests должен быть boolean" }, { status: 400 });
    }
    patch.allowGuests = input.allowGuests;
  }

  if (patch.enabled === undefined && patch.allowGuests === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const settings = await updateWatchPartySettings(patch);
  return NextResponse.json({ settings });
}
