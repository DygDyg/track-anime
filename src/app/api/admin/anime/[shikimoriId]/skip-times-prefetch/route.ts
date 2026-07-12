import { NextRequest, NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getAnimeEpisodeSkipTimes } from "@/lib/aniskip";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

type EpisodeRef = {
  seasonNumber: number;
  episodeNumber: number;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let index = 0;

  async function worker() {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      try {
        results[current] = { status: "fulfilled", value: await mapper(items[current]) };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const { shikimoriId: raw } = await params;
  const shikimoriId = parsePositiveInt(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  const seasonNumber = parsePositiveInt(request.nextUrl.searchParams.get("season")) ?? 1;
  const currentEpisode = parsePositiveInt(request.nextUrl.searchParams.get("episode"));
  const episodeLength = parsePositiveNumber(request.nextUrl.searchParams.get("episodeLength")) ?? 1440;
  const radius = Math.min(parsePositiveInt(request.nextUrl.searchParams.get("radius")) ?? 20, 50);
  const limit = Math.min(parsePositiveInt(request.nextUrl.searchParams.get("limit")) ?? 40, 100);

  const episodeWhere =
    currentEpisode != null
      ? {
          seasonNumber,
          episodeNumber: {
            gte: Math.max(1, currentEpisode - radius),
            lte: currentEpisode + radius,
          },
        }
      : { seasonNumber };

  const episodes = await prisma.kodikEpisode.findMany({
    where: {
      ...episodeWhere,
      material: { shikimoriId },
    },
    distinct: ["seasonNumber", "episodeNumber"],
    orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
    take: limit,
    select: {
      seasonNumber: true,
      episodeNumber: true,
    },
  });

  const refs: EpisodeRef[] = episodes.map((episode) => ({
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  }));

  const settled = await mapWithConcurrency(refs, 4, (episode) =>
    getAnimeEpisodeSkipTimes({
      shikimoriId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeLength,
    }),
  );

  const fulfilled = settled.filter(
    (item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof getAnimeEpisodeSkipTimes>>> =>
      item.status === "fulfilled",
  );
  const found = fulfilled.filter((item) => item.value.found);

  return NextResponse.json({
    shikimoriId,
    episodeLength,
    checked: settled.length,
    failed: settled.length - fulfilled.length,
    found: found.length,
    episodes: found.map((item) => ({
      seasonNumber: item.value.seasonNumber,
      episodeNumber: item.value.episodeNumber,
      count: item.value.results.length,
      source: item.value.source,
    })),
  });
}
