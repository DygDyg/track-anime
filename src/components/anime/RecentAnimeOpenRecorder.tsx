"use client";

import { useEffect, useRef } from "react";
import { recordRecentAnimeOpen, saveRemoteRecentAnimeOpen } from "@/lib/recent-anime-opens";
import { useAuth } from "@/components/auth/AuthProvider";

type Props = {
  shikimoriId: number;
  title: string;
};

/** Записывает открытие страницы тайтла в локальную и серверную историю. */
export function RecentAnimeOpenRecorder({ shikimoriId, title }: Props) {
  const { user } = useAuth();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    recordRecentAnimeOpen(shikimoriId, title);

    if (!user) {
      syncedRef.current = null;
      return;
    }

    const key = `${user.id}:${shikimoriId}:${title}`;
    if (syncedRef.current === key) return;
    syncedRef.current = key;

    void saveRemoteRecentAnimeOpen(shikimoriId, title).catch(() => undefined);
  }, [shikimoriId, title, user]);

  return null;
}
