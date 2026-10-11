/** Client-safe parse of Kodik /ftor parser skip fields (`skip_timings` / `skip_raw`). */

export type KodikParserSkipType = "op" | "ed" | "mixed-op" | "mixed-ed";

export type KodikParserSkipInterval = {
  skipType: KodikParserSkipType;
  startTime: number;
  endTime: number;
};

export type KodikParserSkipTimes = {
  found: boolean;
  source: "parser";
  parserSource: string | null;
  genre: string | null;
  raw: string | null;
  results: KodikParserSkipInterval[];
};

function parseClockToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return null;
  }
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

function normalizeSkipType(value: unknown): KodikParserSkipType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (key === "op" || key === "opening" || key === "intro") return "op";
  if (key === "ed" || key === "ending" || key === "outro" || key === "credits") return "ed";
  if (key === "mixed-op" || key === "mixed_op" || key === "mixedop") return "mixed-op";
  if (key === "mixed-ed" || key === "mixed_ed" || key === "mixeded") return "mixed-ed";
  return null;
}

function readIntervalBounds(raw: Record<string, unknown>): { start: number; end: number } | null {
  const startCandidates = [raw.startTime, raw.start_time, raw.start, raw.from, raw.begin];
  const endCandidates = [raw.endTime, raw.end_time, raw.end, raw.to, raw.finish];
  let start: number | null = null;
  let end: number | null = null;
  for (const value of startCandidates) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      start = value;
      break;
    }
    if (typeof value === "string") {
      start = parseClockToSeconds(value);
      if (start != null) break;
    }
  }
  for (const value of endCandidates) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      end = value;
      break;
    }
    if (typeof value === "string") {
      end = parseClockToSeconds(value);
      if (end != null) break;
    }
  }
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

function parseSkipRaw(raw: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const chunk of raw.split(/[,;]+/)) {
    const piece = chunk.trim();
    if (!piece) continue;
    const match = piece.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (!match) continue;
    const start = parseClockToSeconds(match[1] ?? "");
    const end = parseClockToSeconds(match[2] ?? "");
    if (start == null || end == null || end <= start) continue;
    out.push({ start, end });
  }
  return out;
}

function assignSkipTypes(
  intervals: Array<{ start: number; end: number; type?: KodikParserSkipType | null }>,
): KodikParserSkipInterval[] {
  if (intervals.length === 0) return [];
  return intervals.map((interval, index) => {
    let skipType = interval.type ?? null;
    if (!skipType) {
      if (intervals.length === 1) {
        skipType = interval.start < 12 * 60 ? "op" : "ed";
      } else if (index === 0) {
        skipType = "op";
      } else if (index === intervals.length - 1) {
        skipType = "ed";
      } else {
        skipType = interval.start < 12 * 60 ? "mixed-op" : "mixed-ed";
      }
    }
    return {
      skipType,
      startTime: interval.start,
      endTime: interval.end,
    };
  });
}

function parseSkipTimingsArray(raw: unknown): Array<{
  start: number;
  end: number;
  type?: KodikParserSkipType | null;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ start: number; end: number; type?: KodikParserSkipType | null }> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const parsed = parseSkipRaw(item);
      out.push(...parsed.map((row) => ({ ...row, type: null })));
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const bounds = readIntervalBounds(record);
    if (!bounds) continue;
    const type =
      normalizeSkipType(record.skipType) ??
      normalizeSkipType(record.skip_type) ??
      normalizeSkipType(record.type) ??
      normalizeSkipType(record.kind) ??
      null;
    out.push({ start: bounds.start, end: bounds.end, type });
  }
  return out;
}

/** Parse `skip_timings` / `skip_raw` (+ optional metadata) from parser JSON. */
export function parseKodikParserSkipTimes(raw: unknown): KodikParserSkipTimes | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const fromTimings = parseSkipTimingsArray(data.skip_timings ?? data.skipTimings);
  const rawText =
    typeof data.skip_raw === "string"
      ? data.skip_raw.trim()
      : typeof data.skipRaw === "string"
        ? data.skipRaw.trim()
        : "";
  const fromRaw = rawText ? parseSkipRaw(rawText).map((row) => ({ ...row, type: null })) : [];
  const intervals = fromTimings.length > 0 ? fromTimings : fromRaw;
  const results = assignSkipTypes(intervals);
  if (results.length === 0) return null;
  return {
    found: true,
    source: "parser",
    parserSource:
      typeof data.skip_source === "string"
        ? data.skip_source.trim() || null
        : typeof data.skipSource === "string"
          ? data.skipSource.trim() || null
          : null,
    genre:
      typeof data.skip_genre === "string"
        ? data.skip_genre.trim() || null
        : typeof data.skipGenre === "string"
          ? data.skipGenre.trim() || null
          : null,
    raw: rawText || null,
    results,
  };
}
