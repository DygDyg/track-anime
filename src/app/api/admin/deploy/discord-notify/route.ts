import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getDeployDiscordSettingsDto,
  updateDeployDiscordSettings,
} from "@/lib/admin/deploy-discord-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  try {
    const settings = await getDeployDiscordSettingsDto();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось загрузить настройки";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    webhookUrl?: unknown;
    clearWebhook?: unknown;
    notifyStarted?: unknown;
    notifyFinished?: unknown;
  };

  try {
    const settings = await updateDeployDiscordSettings({
      webhookUrl: typeof input.webhookUrl === "string" ? input.webhookUrl : undefined,
      clearWebhook: input.clearWebhook === true,
      notifyStarted: typeof input.notifyStarted === "boolean" ? input.notifyStarted : undefined,
      notifyFinished: typeof input.notifyFinished === "boolean" ? input.notifyFinished : undefined,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить";
    const status = message.includes("Ожидается URL") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
