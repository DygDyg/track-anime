/** Клиентский прогон: сначала /api/cover, затем force — порядок важен. */

export type CoverRefreshUiPair = {
  shikimoriId: number;
  beforeUrl: string;
  afterUrl: string;
  hasBefore: boolean;
  hasAfter: boolean;
  changed: boolean;
};

export type CoverRefreshClientProgress = {
  total: number;
  done: number;
  failed: number;
  changed: number;
  currentShikimoriId: number | null;
};

function coverUrl(shikimoriId: number, force: boolean, nonce: string): string {
  const params = new URLSearchParams({ id: String(shikimoriId), _: nonce });
  if (force) params.set("force", "true");
  return `/api/cover?${params.toString()}`;
}

async function fetchCoverEtag(url: string): Promise<{ ok: boolean; etag: string | null }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const etag = res.headers.get("etag");
    if (res.body) {
      await res.arrayBuffer();
    }
    return { ok: res.ok, etag };
  } catch {
    return { ok: false, etag: null };
  }
}

/** Одна пара: кэш как есть → force-перекачка. */
export async function refreshCoverPairInBrowser(
  shikimoriId: number,
  sessionNonce: string,
): Promise<CoverRefreshUiPair> {
  const beforeUrl = coverUrl(shikimoriId, false, `${sessionNonce}-before`);
  const afterUrl = coverUrl(shikimoriId, true, `${sessionNonce}-after`);

  const before = await fetchCoverEtag(beforeUrl);
  const after = await fetchCoverEtag(afterUrl);

  const changed =
    after.ok &&
    (!before.ok ||
      (before.etag != null && after.etag != null && before.etag !== after.etag));

  return {
    shikimoriId,
    beforeUrl,
    afterUrl,
    hasBefore: before.ok,
    hasAfter: after.ok,
    changed,
  };
}
