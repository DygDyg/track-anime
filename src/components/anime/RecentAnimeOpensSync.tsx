"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  readRecentAnimeOpens,
  fetchRemoteRecentAnimeOpens,
  syncRemoteRecentAnimeOpens,
  writeRecentAnimeOpens,
} from "@/lib/recent-anime-opens";

/** Синхронизирует локальную историю открытий с сервером после входа. */
export function RecentAnimeOpensSync() {
  const { user, loading } = useAuth();
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      syncedUserIdRef.current = null;
      return;
    }

    if (syncedUserIdRef.current === user.id) return;

    let cancelled = false;

    void (async () => {
      try {
        const localItems = readRecentAnimeOpens();
        const remoteItems = await fetchRemoteRecentAnimeOpens();
        if (cancelled) return;

        syncedUserIdRef.current = user.id;

        if (remoteItems === null) return;

        if (remoteItems.length > 0) {
          writeRecentAnimeOpens(remoteItems);
          return;
        }

        if (localItems.length === 0) return;

        const merged = await syncRemoteRecentAnimeOpens(localItems);
        if (cancelled || merged === null) return;
        writeRecentAnimeOpens(merged);
      } catch {
        if (!cancelled) syncedUserIdRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  return null;
}
