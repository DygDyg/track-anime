import fs from "node:fs/promises";
import path from "node:path";
import "server-only";
import type {
  SiteChangelogEntry,
  SiteChangelogFile,
  SiteChangelogItem,
  SiteChangelogItemKind,
} from "@/lib/site-changelog-types";

export type {
  SiteChangelogEntry,
  SiteChangelogFile,
  SiteChangelogItem,
  SiteChangelogItemKind,
};

export const SITE_CHANGELOG_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "site-changelog.json",
);

const EMPTY: SiteChangelogFile = { version: 1, entries: [] };

const KINDS = new Set<SiteChangelogItemKind>([
  "feature",
  "improvement",
  "change",
  "fix",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeItem(raw: unknown): SiteChangelogItem | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (typeof kind !== "string" || !KINDS.has(kind as SiteChangelogItemKind) || !text) {
    return null;
  }
  return { kind: kind as SiteChangelogItemKind, text };
}

function normalizeEntry(raw: unknown): SiteChangelogEntry | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const recordedAt = typeof raw.recordedAt === "string" ? raw.recordedAt.trim() : "";
  if (!id || !recordedAt || !Array.isArray(raw.items)) return null;

  const items = raw.items.map(normalizeItem).filter((item): item is SiteChangelogItem => item != null);
  if (items.length === 0) return null;

  const entry: SiteChangelogEntry = { id, recordedAt, items };
  if (typeof raw.gitSha === "string" && raw.gitSha.trim()) entry.gitSha = raw.gitSha.trim();
  if (typeof raw.title === "string" && raw.title.trim()) entry.title = raw.title.trim();
  if (raw.buildNumber === null) entry.buildNumber = null;
  else if (typeof raw.buildNumber === "number" && Number.isFinite(raw.buildNumber)) {
    entry.buildNumber = Math.trunc(raw.buildNumber);
  }
  return entry;
}

function normalizeFile(raw: unknown): SiteChangelogFile {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) return EMPTY;
  const entries = raw.entries
    .map(normalizeEntry)
    .filter((entry): entry is SiteChangelogEntry => entry != null);
  return { version: 1, entries };
}

/** Read user-facing deploy changelog (newest first). Safe if file missing. */
export async function getSiteChangelog(): Promise<SiteChangelogFile> {
  try {
    const text = await fs.readFile(SITE_CHANGELOG_FILE, "utf8");
    return normalizeFile(JSON.parse(text) as unknown);
  } catch {
    return EMPTY;
  }
}

/** Public list for future UI — newest first, optional limit. */
export async function listSiteChangelogEntries(limit?: number): Promise<SiteChangelogEntry[]> {
  const { entries } = await getSiteChangelog();
  if (limit == null || limit <= 0) return entries;
  return entries.slice(0, limit);
}
