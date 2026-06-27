import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getDiscordSettingsDto, updateDiscordSettings } from "@/lib/discord-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getDiscordSettingsDto();
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

  const record = body as {
    applicationId?: unknown;
    largeImageKey?: unknown;
    bridgeDownloadUrl?: unknown;
  };

  try {
    const settings = await updateDiscordSettings({
      ...("applicationId" in record ? { applicationId: record.applicationId as string | null } : {}),
      ...(typeof record.largeImageKey === "string"
        ? { largeImageKey: record.largeImageKey }
        : {}),
      ...("bridgeDownloadUrl" in record
        ? { bridgeDownloadUrl: record.bridgeDownloadUrl as string | null }
        : {}),
    });
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
