import fs from "node:fs/promises";
import path from "node:path";
import "server-only";
import type {
  SiteChangelogAudience,
  SiteChangelogEntry,
  SiteChangelogFile,
  SiteChangelogItem,
  SiteChangelogItemKind,
} from "@/lib/site-changelog-types";

export type {
  SiteChangelogAudience,
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

/** Calendar day for grouping entries (RU product UI). */
export const SITE_CHANGELOG_DAY_TZ = "Europe/Moscow";

const EMPTY: SiteChangelogFile = { version: 1, entries: [] };

const KINDS = new Set<SiteChangelogItemKind>([
  "feature",
  "improvement",
  "change",
  "fix",
]);

const AUDIENCES = new Set<SiteChangelogAudience>(["public", "admin"]);

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
  const item: SiteChangelogItem = { kind: kind as SiteChangelogItemKind, text };
  if (typeof raw.audience === "string" && AUDIENCES.has(raw.audience as SiteChangelogAudience)) {
    item.audience = raw.audience as SiteChangelogAudience;
  }
  return item;
}

/** True when item is visible to end users (omitted audience = public). */
export function isPublicChangelogItem(item: Pick<SiteChangelogItem, "audience">): boolean {
  return item.audience !== "admin";
}

/**
 * Strip admin-only items; drop days with no remaining public items.
 * Used by public API / «Что нового».
 */
export function toPublicChangelogEntries(entries: SiteChangelogEntry[]): SiteChangelogEntry[] {
  const out: SiteChangelogEntry[] = [];
  for (const entry of entries) {
    const items = entry.items.filter(isPublicChangelogItem).map((item) => {
      const next: SiteChangelogItem = { kind: item.kind, text: item.text };
      if (item.audience === "public") next.audience = "public";
      return next;
    });
    if (items.length === 0) continue;
    out.push({ ...entry, items });
  }
  return out;
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

/** `YYYY-MM-DD` for `when` in Europe/Moscow (or another IANA zone). */
export function siteChangelogCalendarDay(
  when: string | Date = new Date(),
  timeZone: string = SITE_CHANGELOG_DAY_TZ,
): string {
  const date = typeof when === "string" ? new Date(when) : when;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

/** Stable daily entry id (`YYYY-MM-DD` Moscow). */
export function siteChangelogDayId(when: string | Date = new Date()): string {
  return siteChangelogCalendarDay(when);
}

/** Normalize item text for dedupe (trim, collapse whitespace, case-fold). */
export function normalizeChangelogItemText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

/** Append incoming items; skip duplicates by normalized text (keep first / existing). */
export function mergeChangelogItems(
  existing: SiteChangelogItem[],
  incoming: SiteChangelogItem[],
): SiteChangelogItem[] {
  const seen = new Set<string>();
  const out: SiteChangelogItem[] = [];
  for (const item of [...existing, ...incoming]) {
    const key = normalizeChangelogItemText(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const next: SiteChangelogItem = {
      kind: item.kind,
      text: item.text.trim().replace(/\s+/g, " "),
    };
    if (item.audience === "admin" || item.audience === "public") {
      next.audience = item.audience;
    }
    out.push(next);
  }
  return out;
}

/** True if entry belongs to the same Moscow calendar day as `when`. */
export function isSameChangelogDay(
  entry: Pick<SiteChangelogEntry, "id" | "recordedAt">,
  when: string | Date = new Date(),
): boolean {
  const day = siteChangelogCalendarDay(when);
  if (!day) return false;
  if (entry.id === day || entry.id.startsWith(`${day}-`)) return true;
  const recordedDay = siteChangelogCalendarDay(entry.recordedAt);
  return recordedDay === day;
}

export type UpsertDailyChangelogPatch = {
  items: SiteChangelogItem[];
  gitSha?: string;
  title?: string;
  buildNumber?: number | null;
  /** Defaults to now (ISO). */
  recordedAt?: string;
  /** Day key; defaults from `recordedAt` / now in Moscow. */
  day?: string;
};

/**
 * Merge into today's top entry (Moscow day) or prepend a new daily entry.
 * Does not write to disk — returns updated file object.
 */
export function upsertDailyChangelogEntry(
  file: SiteChangelogFile,
  patch: UpsertDailyChangelogPatch,
): SiteChangelogFile {
  const recordedAt = patch.recordedAt?.trim() || new Date().toISOString();
  const day = patch.day?.trim() || siteChangelogCalendarDay(recordedAt);
  if (!day || patch.items.length === 0) return file;

  const entries = [...file.entries];
  const top = entries[0];
  if (top && isSameChangelogDay(top, recordedAt)) {
    const merged: SiteChangelogEntry = {
      ...top,
      id: day,
      recordedAt,
      items: mergeChangelogItems(top.items, patch.items),
    };
    if (patch.gitSha?.trim()) merged.gitSha = patch.gitSha.trim();
    if (patch.title?.trim()) merged.title = patch.title.trim();
    if (patch.buildNumber === null) merged.buildNumber = null;
    else if (typeof patch.buildNumber === "number" && Number.isFinite(patch.buildNumber)) {
      merged.buildNumber = Math.trunc(patch.buildNumber);
    }
    entries[0] = merged;
    return { version: 1, entries };
  }

  const entry: SiteChangelogEntry = {
    id: day,
    recordedAt,
    items: mergeChangelogItems([], patch.items),
  };
  if (patch.gitSha?.trim()) entry.gitSha = patch.gitSha.trim();
  if (patch.title?.trim()) entry.title = patch.title.trim();
  if (patch.buildNumber === null) entry.buildNumber = null;
  else if (typeof patch.buildNumber === "number" && Number.isFinite(patch.buildNumber)) {
    entry.buildNumber = Math.trunc(patch.buildNumber);
  }
  return { version: 1, entries: [entry, ...entries] };
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

/**
 * Entries whose Moscow calendar day is already over (not "today").
 * Today's daily entry is still being collected and must not auto-show.
 * By default returns the **public** slice (admin-only items stripped; empty days dropped).
 * Pass `{ audience: "all" }` for admin preview of completed days including admin items.
 */
export async function listCompletedSiteChangelogEntries(
  limit?: number,
  when: string | Date = new Date(),
  options?: { audience?: "public" | "all" },
): Promise<SiteChangelogEntry[]> {
  const { entries } = await getSiteChangelog();
  const completed = entries.filter((entry) => !isSameChangelogDay(entry, when));
  const sliced =
    options?.audience === "all" ? completed : toPublicChangelogEntries(completed);
  if (limit == null || limit <= 0) return sliced;
  return sliced.slice(0, limit);
}
