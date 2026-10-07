import { NextResponse } from "next/server";
import { enrichCvhRestrictionMarkers } from "@/lib/cvh-content-api";
import {
  emptyCvhRestrictionMarkers,
  fetchCvhPlaylist,
  getCvhMalAggregator,
  getCvhPub,
  isCvhPlaylistPresent,
  listCvhEpisodesForVoice,
  listCvhVoices,
  markersFromCvhPlaylistTags,
  mergeCvhRestrictionMarkers,
  type CvhAggregator,
  type CvhPlaylistResponse,
  type CvhRestrictionMarkers,
} from "@/lib/cvh-player";
import { resolveMalIdForShikimoriId } from "@/lib/shikimori/mal-id";

export const dynamic = "force-dynamic";

/** Soft budget for MAL resolve / Content API enrich — playlist must win. */
const CVH_SIDEWORK_TIMEOUT_MS = 2_000;

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function restrictionsFromPlaylist(
  playlist: CvhPlaylistResponse | null | undefined,
): CvhRestrictionMarkers {
  if (!playlist) return emptyCvhRestrictionMarkers();
  return markersFromCvhPlaylistTags(playlist.tags);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveRestrictions(input: {
  base: CvhRestrictionMarkers;
  malId: number | null;
  titleId: string | null;
}): Promise<CvhRestrictionMarkers> {
  try {
    return await withTimeout(
      enrichCvhRestrictionMarkers(input.base, {
        malId: input.malId,
        titleId: input.titleId,
      }),
      CVH_SIDEWORK_TIMEOUT_MS,
      input.base,
    );
  } catch (error) {
    console.error("[cvh restrictions enrich]", error);
    return input.base;
  }
}

async function resolveMalIdSafe(shikimoriId: number): Promise<number | null> {
  try {
    return await withTimeout(resolveMalIdForShikimoriId(shikimoriId), CVH_SIDEWORK_TIMEOUT_MS, null);
  } catch (error) {
    console.error("[cvh mal id]", shikimoriId, error);
    return null;
  }
}

function buildPlaylistPayload(input: {
  available: boolean;
  reason: string | null;
  shikimoriId: number;
  titleId: string | null;
  malId: number | null;
  aggr: CvhAggregator;
  playlist: CvhPlaylistResponse | null;
  restrictions?: CvhRestrictionMarkers;
}) {
  const voices = input.playlist ? listCvhVoices(input.playlist.items) : [];
  const episodesByVoice: Record<string, Array<{ season: number; episode: number }>> = {};
  for (const voice of voices) {
    episodesByVoice[voice.studio] = listCvhEpisodesForVoice(
      input.playlist?.items ?? [],
      voice.studio,
    );
  }
  const primaryVoice = voices[0]?.studio ?? null;
  const episodes = primaryVoice ? episodesByVoice[primaryVoice] ?? [] : [];
  const restrictions =
    input.restrictions ?? restrictionsFromPlaylist(input.playlist);

  return {
    available: input.available,
    reason: input.reason,
    shikimoriId: input.shikimoriId,
    titleId: input.titleId,
    malId: input.malId,
    pub: getCvhPub(),
    aggr: input.aggr,
    titleName: input.playlist?.titleName ?? null,
    isSerial: input.playlist?.isSerial ?? false,
    voices,
    episodes,
    episodesByVoice,
    itemCount: input.playlist?.items.length ?? 0,
    restrictions,
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parsePositiveInt(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  const malAggregator = getCvhMalAggregator();

  try {
    // 1) Prefer Shikimori ID dictionary in CVH plapi.
    const shikimoriPlaylist = await fetchCvhPlaylist({
      aggr: "shikimori",
      id: String(shikimoriId),
    });
    const shikimoriRestrictions = restrictionsFromPlaylist(shikimoriPlaylist);

    if (isCvhPlaylistPresent(shikimoriPlaylist)) {
      // Playlist is enough to play — MAL / Content API enrich must not stall the response.
      const [malId, restrictions] = await Promise.all([
        resolveMalIdSafe(shikimoriId),
        resolveRestrictions({
          base: shikimoriRestrictions,
          malId: null,
          titleId: String(shikimoriId),
        }),
      ]);
      return NextResponse.json(
        buildPlaylistPayload({
          available: true,
          reason: null,
          shikimoriId,
          titleId: String(shikimoriId),
          malId,
          aggr: "shikimori",
          playlist: shikimoriPlaylist,
          restrictions,
        }),
      );
    }

    // 2) Fallback: MAL ID (when Shikimori mapping is empty / missing in CVH).
    const malId = await resolveMalIdSafe(shikimoriId);
    if (!malId) {
      const restrictions = await resolveRestrictions({
        base: shikimoriRestrictions,
        malId: null,
        titleId: null,
      });
      return NextResponse.json(
        buildPlaylistPayload({
          available: false,
          reason: "no_mal_id",
          shikimoriId,
          titleId: null,
          malId: null,
          aggr: malAggregator,
          playlist: null,
          restrictions,
        }),
      );
    }

    const malPlaylist = await fetchCvhPlaylist({
      aggr: malAggregator,
      id: String(malId),
    });
    const playlistRestrictions = mergeCvhRestrictionMarkers(
      shikimoriRestrictions,
      restrictionsFromPlaylist(malPlaylist),
    );
    const restrictions = await resolveRestrictions({
      base: playlistRestrictions,
      malId,
      titleId: String(malId),
    });

    if (!isCvhPlaylistPresent(malPlaylist)) {
      return NextResponse.json(
        buildPlaylistPayload({
          available: false,
          reason: "empty_playlist",
          shikimoriId,
          titleId: String(malId),
          malId,
          aggr: malAggregator,
          playlist: malPlaylist,
          restrictions,
        }),
      );
    }

    return NextResponse.json(
      buildPlaylistPayload({
        available: true,
        reason: null,
        shikimoriId,
        titleId: String(malId),
        malId,
        aggr: malAggregator,
        playlist: malPlaylist,
        restrictions,
      }),
    );
  } catch (error) {
    console.error("[cvh playlist]", shikimoriId, error);
    // 200 + available:false — avoid Cloudflare replacing a late 502 with a bare text body
    // that crashes the client when JSON is expected.
    return NextResponse.json(
      buildPlaylistPayload({
        available: false,
        reason: "fetch_error",
        shikimoriId,
        titleId: null,
        malId: null,
        aggr: malAggregator,
        playlist: null,
      }),
    );
  }
}
