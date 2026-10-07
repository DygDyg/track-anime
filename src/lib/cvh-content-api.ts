/**
 * CDN VideoHub Content API (public-api.cdnvideohub.com).
 * Used to enrich plapi restriction tags with lgbt/licensed from /titles/restricted.
 * Bearer token stays server-side only (CVH_CONTENT_API_TOKEN).
 */

import {
  mergeCvhRestrictionMarkers,
  type CvhRestrictionMarkers,
} from "@/lib/cvh-player";

export const CVH_CONTENT_API_BASE_DEFAULT = "https://public-api.cdnvideohub.com";

const RESTRICTED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESTRICTED_PAGE_LIMIT = 100;
const RESTRICTED_MAX_PAGES = 250;
/** Per-page budget — never stall `/api/anime/.../cvh` on Content API. */
const RESTRICTED_PAGE_TIMEOUT_MS = 5_000;

type RestrictedIndex = {
  byMal: Map<string, CvhRestrictionMarkers>;
  byId: Map<string, CvhRestrictionMarkers>;
  syncedAt: number;
};

let index: RestrictedIndex = {
  byMal: new Map(),
  byId: new Map(),
  syncedAt: 0,
};
let syncInflight: Promise<void> | null = null;

export function getCvhContentApiToken(): string {
  return (
    process.env.CVH_CONTENT_API_TOKEN?.trim() ||
    process.env.CVH_API_TOKEN?.trim() ||
    ""
  );
}

export function getCvhContentApiBase(): string {
  const fromEnv =
    process.env.CVH_CONTENT_API_URL?.trim() ||
    process.env.CVH_API_URL?.trim() ||
    "";
  return (fromEnv || CVH_CONTENT_API_BASE_DEFAULT).replace(/\/$/, "");
}

function rememberRestrictedItem(
  target: Pick<RestrictedIndex, "byMal" | "byId">,
  raw: unknown,
): void {
  if (!raw || typeof raw !== "object") return;
  const row = raw as Record<string, unknown>;
  const markers: CvhRestrictionMarkers = {
    licensed: row.licensed === true,
    lgbt: row.lgbt === true,
    blocked: false,
  };
  if (!markers.licensed && !markers.lgbt) return;

  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (id) {
    target.byId.set(id, mergeCvhRestrictionMarkers(target.byId.get(id), markers));
  }

  const external =
    row.external_ids && typeof row.external_ids === "object"
      ? (row.external_ids as Record<string, unknown>)
      : null;
  const mal = external?.mal != null ? String(external.mal).trim() : "";
  if (mal) {
    target.byMal.set(mal, mergeCvhRestrictionMarkers(target.byMal.get(mal), markers));
  }
}

async function fetchRestrictedPage(cursor: string | null): Promise<{
  items: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const token = getCvhContentApiToken();
  if (!token) {
    return { items: [], hasMore: false, nextCursor: null };
  }

  const url = new URL(`${getCvhContentApiBase()}/api/v1/titles/restricted`);
  url.searchParams.set("limit", String(RESTRICTED_PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(RESTRICTED_PAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`CVH restricted HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: unknown[];
    has_more?: boolean;
    next_cursor?: string | null;
  };

  return {
    items: Array.isArray(data.items) ? data.items : [],
    hasMore: data.has_more === true,
    nextCursor:
      typeof data.next_cursor === "string" && data.next_cursor.trim()
        ? data.next_cursor
        : null,
  };
}

function cacheIsFresh(): boolean {
  return index.syncedAt > 0 && Date.now() - index.syncedAt < RESTRICTED_CACHE_TTL_MS;
}

async function syncRestrictedIndex(): Promise<void> {
  if (!getCvhContentApiToken()) return;
  if (cacheIsFresh()) return;
  if (syncInflight) {
    await syncInflight;
    return;
  }

  syncInflight = (async () => {
    const next: RestrictedIndex = {
      byMal: new Map(),
      byId: new Map(),
      syncedAt: 0,
    };

    let cursor: string | null = null;
    for (let page = 0; page < RESTRICTED_MAX_PAGES; page += 1) {
      const batch = await fetchRestrictedPage(cursor);
      for (const item of batch.items) {
        rememberRestrictedItem(next, item);
      }
      if (!batch.hasMore || !batch.nextCursor) break;
      cursor = batch.nextCursor;
    }

    next.syncedAt = Date.now();
    index = next;
  })()
    .catch((error) => {
      console.error("[cvh restricted sync]", error);
      throw error;
    })
    .finally(() => {
      syncInflight = null;
    });

  await syncInflight;
}

function scheduleRestrictedIndexRefresh(): void {
  if (!getCvhContentApiToken()) return;
  if (cacheIsFresh() || syncInflight) return;
  void syncRestrictedIndex().catch((error) => {
    console.error("[cvh restricted sync background]", error);
  });
}

/**
 * Resolve lgbt/licensed markers from Content API restricted registry.
 * Returns null when token is missing or title is not in the registry.
 *
 * Never blocks the request on a cold full-registry sync (that used to stall
 * `/api/anime/.../cvh` long enough for Cloudflare/nginx 502). Uses whatever is
 * already cached and refreshes in the background when stale/empty.
 */
export async function lookupCvhRestrictedMarkers(input: {
  malId?: number | null;
  titleId?: string | null;
}): Promise<CvhRestrictionMarkers | null> {
  const token = getCvhContentApiToken();
  if (!token) return null;

  const malKey =
    input.malId != null && Number.isFinite(input.malId) && input.malId > 0
      ? String(Math.trunc(input.malId))
      : "";
  const titleKey = input.titleId?.trim() || "";

  if (malKey && index.byMal.has(malKey)) {
    scheduleRestrictedIndexRefresh();
    return index.byMal.get(malKey) ?? null;
  }
  if (titleKey && index.byId.has(titleKey)) {
    scheduleRestrictedIndexRefresh();
    return index.byId.get(titleKey) ?? null;
  }

  scheduleRestrictedIndexRefresh();
  return null;
}

/**
 * Merge plapi tags with Content API restricted markers (lgbt/licensed).
 * Content API does not expose "blocked"; that stays from plapi tag 5.
 */
export async function enrichCvhRestrictionMarkers(
  base: CvhRestrictionMarkers,
  input: { malId?: number | null; titleId?: string | null },
): Promise<CvhRestrictionMarkers> {
  const needsContentApi = !base.licensed || !base.lgbt;
  if (!needsContentApi) return base;

  const fromRegistry = await lookupCvhRestrictedMarkers(input);
  if (!fromRegistry) return base;
  return mergeCvhRestrictionMarkers(base, fromRegistry);
}

export function peekCvhRestrictedCacheStats(): {
  malEntries: number;
  idEntries: number;
  ageMs: number | null;
} {
  return {
    malEntries: index.byMal.size,
    idEntries: index.byId.size,
    ageMs: index.syncedAt > 0 ? Date.now() - index.syncedAt : null,
  };
}

/** Test helper — avoid using in product paths. */
export function resetCvhRestrictedCacheForTests(): void {
  index = { byMal: new Map(), byId: new Map(), syncedAt: 0 };
  syncInflight = null;
}

const POSTER_LOOKUP_TIMEOUT_MS = 4_000;

/**
 * Poster URL from Content API by MAL id.
 * Returns null when token missing, title not found, or request fails.
 */
export async function fetchCvhPosterUrlByMalId(malId: number): Promise<string | null> {
  const token = getCvhContentApiToken();
  if (!token) return null;
  if (!Number.isInteger(malId) || malId <= 0) return null;

  const url = new URL(`${getCvhContentApiBase()}/api/v1/titles`);
  url.searchParams.set("mal_id", String(malId));
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(POSTER_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { items?: unknown[] };
    const item = Array.isArray(data.items) ? data.items[0] : null;
    if (!item || typeof item !== "object") return null;
    const posterUrl = (item as { poster_url?: unknown }).poster_url;
    if (typeof posterUrl !== "string" || !posterUrl.trim()) return null;
    return posterUrl.trim();
  } catch {
    return null;
  }
}
