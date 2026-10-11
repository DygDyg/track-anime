/** User-facing site changelog (shown later in UI). Not a git/commit dump. */

export type SiteChangelogItemKind = "feature" | "improvement" | "change" | "fix";

export type SiteChangelogItem = {
  /** feature | improvement | change | fix (only user-noticeable fixes) */
  kind: SiteChangelogItemKind;
  /** Russian text for end users — what changed for them, not how it was coded */
  text: string;
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
