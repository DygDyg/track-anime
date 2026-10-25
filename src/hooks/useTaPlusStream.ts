"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  sortTaPlusQualityKeys,
  TA_PLUS_QUALITY_AUTO,
} from "@/lib/ta-plus-master-playlist";
import {
  readTaPlusQualityPreference,
  writeTaPlusQualityPreference,
} from "@/lib/ta-plus-quality-preferences";
import type { KodikParserSkipTimes } from "@/lib/kodik-parser-skip";
import type { TaPlusTiles } from "@/lib/ta-plus-tiles";

export { TA_PLUS_QUALITY_AUTO };

type StreamResponse = {
  ok?: boolean;
  error?: string;
  default?: number | null;
  qualities?: Record<string, string>;
  tiles?: TaPlusTiles | null;
  previews?: string[] | null;
  skips?: KodikParserSkipTimes | null;
};

export type TaPlusStreamState = {
  loading: boolean;
  error: string | null;
  qualities: Record<string, string>;
  /** `"auto"` or a height key like `"720"`. */
  quality: string | null;
  streamUrl: string | null;
  tiles: TaPlusTiles | null;
  /** Full-frame idle slideshow URLs (episode screenshots / CDN thumbs). */
  previews: string[];
  /** Parser OP/ED timings (`skip_timings` / `skip_raw`) when present. */
  skips: KodikParserSkipTimes | null;
  setQuality: (quality: string) => void;
  reload: () => void;
};

function resolvePreferredQuality(
  preferred: string,
  qualities: Record<string, string>,
): string {
  if (preferred === TA_PLUS_QUALITY_AUTO) return TA_PLUS_QUALITY_AUTO;
  if (preferred && qualities[preferred]) return preferred;
  return TA_PLUS_QUALITY_AUTO;
}

export function useTaPlusStream(input: {
  enabled: boolean;
  shikimoriId: number;
  kodikId: string | null;
  seasonNumber: number;
  episodeNumber: number;
}): TaPlusStreamState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<Record<string, string>>({});
  const [quality, setQualityState] = useState<string | null>(TA_PLUS_QUALITY_AUTO);
  const [tiles, setTiles] = useState<TaPlusTiles | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [skips, setSkips] = useState<KodikParserSkipTimes | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  /** Manual choice (`auto` or height). Restored from localStorage; written only on setQuality. */
  const preferredQualityRef = useRef<string>(TA_PLUS_QUALITY_AUTO);
  const prefsHydratedRef = useRef(false);
  /** Next fetch should bypass server ftor cache (reload / fatal HLS). */
  const bypassCacheRef = useRef(false);

  useEffect(() => {
    if (prefsHydratedRef.current) return;
    prefsHydratedRef.current = true;
    const stored = readTaPlusQualityPreference();
    if (stored) {
      preferredQualityRef.current = stored;
      setQualityState(stored);
    }
  }, []);

  useEffect(() => {
    if (!input.enabled || !input.kodikId) {
      setLoading(false);
      setError(null);
      setQualities({});
      setQualityState(null);
      setTiles(null);
      setPreviews([]);
      setSkips(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    // Drop previous episode stream immediately so auto-next doesn't play the old URL.
    setQualities({});
    setTiles(null);
    setPreviews([]);
    setSkips(null);

    const bypassCache = bypassCacheRef.current;
    void (async () => {
      try {
        const params = new URLSearchParams({
          kodikId: input.kodikId!,
          season: String(input.seasonNumber),
          episode: String(input.episodeNumber),
        });
        // Keep bypassCacheRef set until this attempt finishes so React Strict Mode
        // remount still sends refresh=1 (clearing at start would drop it).
        if (bypassCache) params.set("refresh", "1");
        const res = await fetch(`/api/anime/${input.shikimoriId}/taplus?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const raw = await res.text();
        let data: StreamResponse;
        try {
          data = JSON.parse(raw) as StreamResponse;
        } catch {
          throw new Error("Не удалось получить поток");
        }
        if (controller.signal.aborted) return;
        if (!res.ok || !data.qualities || Object.keys(data.qualities).length === 0) {
          throw new Error(data.error || "Нет доступных качеств");
        }
        const nextQuality = resolvePreferredQuality(preferredQualityRef.current, data.qualities);
        preferredQualityRef.current = nextQuality;
        setQualities(data.qualities);
        setQualityState(nextQuality);
        setTiles(data.tiles ?? null);
        setPreviews(
          Array.isArray(data.previews)
            ? data.previews.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [],
        );
        setSkips(
          data.skips && data.skips.found && Array.isArray(data.skips.results) && data.skips.results.length > 0
            ? data.skips
            : null,
        );
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Не удалось получить поток");
        setLoading(false);
      } finally {
        if (bypassCache && !controller.signal.aborted) {
          bypassCacheRef.current = false;
        }
      }
    })();

    return () => controller.abort();
  }, [
    input.enabled,
    input.episodeNumber,
    input.kodikId,
    input.seasonNumber,
    input.shikimoriId,
    reloadNonce,
  ]);

  const streamUrl = useMemo(() => {
    const keys = sortTaPlusQualityKeys(qualities);
    if (keys.length === 0) return null;
    if (quality === TA_PLUS_QUALITY_AUTO) {
      return qualities[keys[0]!] ?? null;
    }
    return quality && qualities[quality] ? qualities[quality]! : null;
  }, [qualities, quality]);

  const setQuality = useCallback((next: string) => {
    preferredQualityRef.current = next;
    writeTaPlusQualityPreference(next);
    setQualityState(next);
  }, []);

  const reload = useCallback(() => {
    bypassCacheRef.current = true;
    setReloadNonce((value) => value + 1);
  }, []);

  return {
    loading,
    error,
    qualities,
    quality,
    streamUrl,
    tiles,
    previews,
    skips,
    setQuality,
    reload,
  };
}
