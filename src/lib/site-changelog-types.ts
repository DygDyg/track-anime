/** User-facing site changelog (shown later in UI). Not a git/commit dump. */

export type SiteChangelogItemKind = "feature" | "improvement" | "change" | "fix";

export type SiteChangelogItem = {
  /** feature | improvement | change | fix (only user-noticeable fixes) */
  kind: SiteChangelogItemKind;
  /** Russian text for end users — what changed for them, not how it was coded */
  text: string;
};

export type SiteChangelogEntry = {
  /** Stable id: YYYY-MM-DD + short git sha, e.g. 2026-10-11-a1b2c3d */
  id: string;
  /** ISO time when the entry was recorded (usually right before deploy) */
  recordedAt: string;
  /** Short git sha of the tree being deployed (optional until known) */
  gitSha?: string;
  /** Filled after build when known (.build-number); optional */
  buildNumber?: number | null;
  /** Optional short Russian headline for the deploy batch */
  title?: string;
  items: SiteChangelogItem[];
};

export type SiteChangelogFile = {
  version: 1;
  /** Newest first */
  entries: SiteChangelogEntry[];
};
