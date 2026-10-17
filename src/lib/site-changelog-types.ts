/** Site changelog (public «Что нового» + admin-only notes). Not a git/commit dump. */

export type SiteChangelogItemKind = "feature" | "improvement" | "change" | "fix";

/** Who can see the item. Omitted / `public` = end users; `admin` = admin panel only. */
export type SiteChangelogAudience = "public" | "admin";

export type SiteChangelogItem = {
  /** feature | improvement | change | fix (only user-noticeable fixes when public) */
  kind: SiteChangelogItemKind;
  /** Russian text — for public: what changed for users; for admin: may be more technical */
  text: string;
  /**
   * Visibility. Default `public` when omitted (backward compatible).
   * `admin` items are hidden from `/api/site-changelog` and user UI; shown in `/admin/changelog` with «A» mark.
   */
  audience?: SiteChangelogAudience;
};

export type SiteChangelogEntry = {
  /**
   * Stable daily id: `YYYY-MM-DD` in Europe/Moscow (one card per calendar day).
   * Legacy ids may still be `YYYY-MM-DD-<shortSha>`.
   */
  id: string;
  /** ISO time of the latest merge/update for this day (usually right before deploy) */
  recordedAt: string;
  /** Short git sha of the latest tree merged into this day (optional until known) */
  gitSha?: string;
  /** Filled after build when known (.build-number); optional — keep latest for the day */
  buildNumber?: number | null;
  /** Optional short Russian headline; may be refreshed on later deploys that day */
  title?: string;
  items: SiteChangelogItem[];
};

export type SiteChangelogFile = {
  version: 1;
  /** Newest first */
  entries: SiteChangelogEntry[];
};
