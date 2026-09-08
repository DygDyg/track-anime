import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { sendTestNotification } from "@/lib/notifications/send-test";
import type { NotificationChannelId } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

const CHANNELS: NotificationChannelId[] = ["browser", "fcm", "telegram", "vk", "discord"];

export async function POST(request: Request) {
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
    userId?: unknown;
    shikimoriId?: unknown;
    seasonNumber?: unknown;
    episodeNumber?: unknown;
    channels?: unknown;
  };

  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  const shikimoriId = Number(record.shikimoriId);

  if (!userId || !Number.isFinite(shikimoriId) || shikimoriId <= 0) {
    return NextResponse.json({ error: "Укажите userId и shikimoriId" }, { status: 400 });
  }

  const channels = Array.isArray(record.channels)
    ? record.channels.filter(
        (item): item is NotificationChannelId =>
          typeof item === "string" && CHANNELS.includes(item as NotificationChannelId),
      )
    : CHANNELS;

  if (channels.length === 0) {
    return NextResponse.json({ error: "Выберите хотя бы один канал" }, { status: 400 });
  }

  const seasonNumber =
    record.seasonNumber != null && Number.isFinite(Number(record.seasonNumber))
      ? Number(record.seasonNumber)
      : undefined;
  const episodeNumber =
    record.episodeNumber != null && Number.isFinite(Number(record.episodeNumber))
      ? Number(record.episodeNumber)
      : undefined;

  const result = await sendTestNotification({
    userId,
    shikimoriId,
    seasonNumber,
    episodeNumber,
    channels,
  });

  if (!result.payload) {
    return NextResponse.json(
      { error: "Не найден материал Kodik для этого shikimoriId", results: result.results },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    payload: {
      animeTitle: result.payload.animeTitle,
      seasonNumber: result.payload.seasonNumber,
      episodeNumber: result.payload.episodeNumber,
      translationName: result.payload.translationName,
      pageUrl: result.payload.pageUrl,
    },
    results: result.results,
  });
}
