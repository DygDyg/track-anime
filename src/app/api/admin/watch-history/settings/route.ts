import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  MAX_COMPLETE_EPISODE_THRESHOLD_PCT,
  MIN_COMPLETE_EPISODE_THRESHOLD_PCT,
  getWatchHistorySettingsDto,
  updateWatchHistorySettings,
} from "@/lib/admin/watch-history-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getWatchHistorySettingsDto();
  return NextResponse.json({
    settings,
    minCompleteEpisodeThresholdPct: MIN_COMPLETE_EPISODE_THRESHOLD_PCT,
    maxCompleteEpisodeThresholdPct: MAX_COMPLETE_EPISODE_THRESHOLD_PCT,
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

  const input = body as { completeEpisodeThresholdPct?: unknown };

  if (input.completeEpisodeThresholdPct === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const completeEpisodeThresholdPct = Number(input.completeEpisodeThresholdPct);
  if (
    !Number.isInteger(completeEpisodeThresholdPct) ||
    completeEpisodeThresholdPct < MIN_COMPLETE_EPISODE_THRESHOLD_PCT ||
    completeEpisodeThresholdPct > MAX_COMPLETE_EPISODE_THRESHOLD_PCT
  ) {
    return NextResponse.json(
      {
        error: `completeEpisodeThresholdPct: от ${MIN_COMPLETE_EPISODE_THRESHOLD_PCT} до ${MAX_COMPLETE_EPISODE_THRESHOLD_PCT}`,
      },
      { status: 400 },
    );
  }

  const settings = await updateWatchHistorySettings({ completeEpisodeThresholdPct });
  return NextResponse.json({ settings });
}
