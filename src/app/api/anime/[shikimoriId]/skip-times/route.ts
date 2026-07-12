import { NextRequest, NextResponse } from "next/server";
import { getAnimeEpisodeSkipTimes } from "@/lib/aniskip";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parsePositiveInt(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  const seasonNumber = parsePositiveInt(request.nextUrl.searchParams.get("season")) ?? 1;
  const episodeNumber = parsePositiveInt(request.nextUrl.searchParams.get("episode"));
  const episodeLength = parsePositiveNumber(request.nextUrl.searchParams.get("episodeLength"));
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  if (!episodeNumber) {
    return NextResponse.json({ error: "Некорректная серия" }, { status: 400 });
  }

  if (!episodeLength) {
    return NextResponse.json({ error: "Некорректная длительность серии" }, { status: 400 });
  }

  try {
    const skipTimes = await getAnimeEpisodeSkipTimes({
      shikimoriId,
      seasonNumber,
      episodeNumber,
      episodeLength,
      forceRefresh,
    });

    return NextResponse.json({ skipTimes });
  } catch (error) {
    console.error("[anime/skip-times] failed", error);
    const message = error instanceof Error ? error.message : "Не удалось получить тайминги";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
