"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WATCH_HISTORY_UPDATED_EVENT } from "@/components/anime/AnimePosterWatchActions";
import { buildWatchAheadLabel, type WatchAheadEntry, type WatchAheadMap } from "@/lib/watch-ahead";
import { isWatchHistoryBookmark, type WatchProgressDto } from "@/lib/watch-history";

type WatchAheadContextValue = {
  getEntry: (shikimoriId: number | null | undefined) => WatchAheadEntry | null;
};

const WatchAheadContext = createContext<WatchAheadContextValue | null>(null);

export function WatchAheadProvider({
  initialMap = {},
  children,
}: {
  initialMap?: WatchAheadMap;
  children: ReactNode;
}) {
  const [map, setMap] = useState<WatchAheadMap>(initialMap);

  useEffect(() => {
    setMap(initialMap);
  }, [initialMap]);

  useEffect(() => {
    const onHistoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ shikimoriId: number; progress: WatchProgressDto | null }>)
        .detail;
      if (detail?.shikimoriId == null) return;

      const key = String(detail.shikimoriId);
      setMap((prev) => {
        const existing = prev[key];
        if (!existing) return prev;

        const progress = detail.progress;
        if (
          progress == null ||
          isWatchHistoryBookmark({
            episodeNumber: progress.episodeNumber,
            positionSeconds: progress.positionSeconds,
          })
        ) {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }

        const label = buildWatchAheadLabel(
          progress.seasonNumber,
          progress.episodeNumber,
          existing.latestSeason,
          existing.latestEpisode,
        );

        if (!label) {
          const next = { ...prev };
          delete next[key];
          return next;
        }

        if (label === existing.label) return prev;
        return {
          ...prev,
          [key]: { ...existing, label },
        };
      });
    };

    window.addEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
  }, []);

  const getEntry = useCallback(
    (shikimoriId: number | null | undefined): WatchAheadEntry | null => {
      if (shikimoriId == null) return null;
      return map[String(shikimoriId)] ?? null;
    },
    [map],
  );

  const value = useMemo(() => ({ getEntry }), [getEntry]);

  return <WatchAheadContext.Provider value={value}>{children}</WatchAheadContext.Provider>;
}

export function useWatchAhead(shikimoriId: number | null | undefined): WatchAheadEntry | null {
  const ctx = useContext(WatchAheadContext);
  if (!ctx) return null;
  return ctx.getEntry(shikimoriId);
}
