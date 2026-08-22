"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AnimeAddToHistoryButton } from "@/components/anime/AnimeAddToHistoryButton";
import { AnimeWatchFullscreenButton } from "@/components/anime/AnimeWatchFullscreenButton";
import type { KodikTranslationDto } from "@/lib/anime-page";
import type { WatchProgressDto } from "@/lib/watch-history";

export const WATCH_HISTORY_UPDATED_EVENT = "ta:watch-history-updated";

type Props = {
  shikimoriId: number;
  translations: KodikTranslationDto[];
};

export function AnimePosterWatchActions({ shikimoriId, translations }: Props) {
  const { user } = useAuth();
  const playable = useMemo(
    () => translations.filter((translation) => translation.playerLink),
    [translations],
  );
  const [progress, setProgress] = useState<WatchProgressDto | null | undefined>(undefined);
  const [playerKodikId, setPlayerKodikId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProgress(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/user/watch-history/${shikimoriId}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setProgress(null);
          return;
        }
        const data = (await res.json()) as { progress?: WatchProgressDto | null };
        if (!cancelled) setProgress(data.progress ?? null);
      } catch {
        if (!cancelled) setProgress(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, shikimoriId]);

  useEffect(() => {
    const onTranslationChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ shikimoriId: number; kodikId: string }>).detail;
      if (detail?.shikimoriId !== shikimoriId || !detail.kodikId) return;
      setPlayerKodikId(detail.kodikId);
    };

    window.addEventListener("ta:player-translation-changed", onTranslationChanged);
    return () => window.removeEventListener("ta:player-translation-changed", onTranslationChanged);
  }, [shikimoriId]);

  const kodikId = useMemo(() => {
    if (playerKodikId && playable.some((translation) => translation.kodikId === playerKodikId)) {
      return playerKodikId;
    }
    const savedKodikId = progress?.kodikId;
    if (savedKodikId && playable.some((translation) => translation.kodikId === savedKodikId)) {
      return savedKodikId;
    }
    return playable[0]?.kodikId ?? "";
  }, [playerKodikId, playable, progress?.kodikId]);

  const handleProgressSaved = (saved: WatchProgressDto) => {
    setProgress(saved);
    window.dispatchEvent(
      new CustomEvent(WATCH_HISTORY_UPDATED_EVENT, {
        detail: { shikimoriId, progress: saved },
      }),
    );
  };

  const disabled = playable.length === 0;

  return (
    <>
      <AnimeWatchFullscreenButton disabled={disabled} />
      <AnimeAddToHistoryButton
        shikimoriId={shikimoriId}
        kodikId={kodikId}
        ready={progress !== undefined}
        hasProgress={progress != null}
        onProgressSaved={handleProgressSaved}
        fullWidth
        className="mt-2"
      />
    </>
  );
}
