"use client";

import { useRouter } from "next/navigation";
import { useVisiblePoll } from "@/hooks/useVisiblePoll";

/** RSC-блоки главной (история / скоро / новинки) — реже, чем лента. */
const HOME_RSC_REFRESH_MS = 5 * 60_000;
const HOME_RSC_STALE_ON_RESUME_MS = 60_000;

/**
 * Редкий router.refresh() только на видимой вкладке:
 * подтягивает «Новое в вашей истории», «Скоро», «Новинки» без reload.
 * Лента живёт своим poll в ReleaseFeed.
 */
export function HomeLiveRefresh() {
  const router = useRouter();

  useVisiblePoll({
    onPoll: () => {
      router.refresh();
    },
    intervalMs: HOME_RSC_REFRESH_MS,
    minStaleOnResumeMs: HOME_RSC_STALE_ON_RESUME_MS,
    // Не refresh сразу после SSR — первый тик через interval.
    startDelayMs: HOME_RSC_REFRESH_MS,
  });

  return null;
}
