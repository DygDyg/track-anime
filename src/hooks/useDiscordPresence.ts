"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDiscordPresence,
  formatDiscordBrowseState,
  formatDiscordEpisodeState,
  sendDiscordPresence,
} from "@/lib/discord-presence";

const UPDATE_INTERVAL_MS = 15_000;

type WatchPresence = {
  animeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  paused: boolean;
};

type BrowsePresence = {
  sitePageLabel: string;
  pageUrl: string;
};

type Options = {
  enabled: boolean;
  applicationId: string | null;
  largeImageKey?: string;
  mode?: "watch" | "browse";
  animeTitle?: string;
  showSitePage?: boolean;
  sitePageLabel?: string | null;
  openButtonEnabled?: boolean;
  pageUrl?: string;
};

export function useDiscordPresence({
  enabled,
  applicationId,
  largeImageKey,
  mode = "watch",
  animeTitle = "Track Anime",
  showSitePage = false,
  sitePageLabel = null,
  openButtonEnabled = false,
  pageUrl,
}: Options) {
  const watchRef = useRef<WatchPresence | null>(null);
  const browseRef = useRef<BrowsePresence | null>(null);
  const lastSentRef = useRef("");
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  const canSend = enabled && applicationId && tabVisible;

  const pushPresence = useCallback(
    async (force = false) => {
      if (!canSend) return;

      if (mode === "browse") {
        const current = browseRef.current;
        if (!current) return;

        const fingerprint = ["browse", current.sitePageLabel, current.pageUrl].join("|");
        if (!force && fingerprint === lastSentRef.current) return;

        const ok = await sendDiscordPresence({
          active: true,
          applicationId,
          largeImageKey,
          mode: "browse",
          sitePageLabel: current.sitePageLabel,
          pageUrl: current.pageUrl,
          openButtonEnabled,
        });

        if (ok) lastSentRef.current = fingerprint;
        return;
      }

      const current = watchRef.current;
      if (!current) return;

      const pageSuffix = showSitePage && sitePageLabel ? sitePageLabel : "";
      const fingerprint = [
        "watch",
        current.animeTitle,
        current.seasonNumber,
        current.episodeNumber,
        Math.floor(current.positionSeconds),
        current.paused ? "1" : "0",
        pageSuffix,
        openButtonEnabled ? pageUrl ?? "" : "",
      ].join("|");

      if (!force && fingerprint === lastSentRef.current) return;

      const ok = await sendDiscordPresence({
        active: true,
        applicationId,
        largeImageKey,
        mode: "watch",
        animeTitle: current.animeTitle,
        seasonNumber: current.seasonNumber,
        episodeNumber: current.episodeNumber,
        positionSeconds: current.positionSeconds,
        paused: current.paused,
        sitePageLabel: showSitePage ? sitePageLabel ?? undefined : undefined,
        pageUrl: openButtonEnabled ? pageUrl : undefined,
        openButtonEnabled,
      });

      if (ok) lastSentRef.current = fingerprint;
    },
    [
      applicationId,
      canSend,
      largeImageKey,
      mode,
      openButtonEnabled,
      pageUrl,
      showSitePage,
      sitePageLabel,
    ],
  );

  const syncProgress = useCallback(
    (payload: {
      seasonNumber: number;
      episodeNumber: number;
      positionSeconds: number;
      paused?: boolean;
    }) => {
      if (!enabled || mode !== "watch") return;

      watchRef.current = {
        animeTitle,
        seasonNumber: payload.seasonNumber,
        episodeNumber: payload.episodeNumber,
        positionSeconds: payload.positionSeconds,
        paused: payload.paused ?? false,
      };
    },
    [animeTitle, enabled, mode],
  );

  const syncBrowse = useCallback(
    (payload: BrowsePresence) => {
      if (!enabled || mode !== "browse") return;
      browseRef.current = payload;
      if (applicationId && tabVisible) {
        void pushPresence(true);
      }
    },
    [applicationId, enabled, mode, pushPresence, tabVisible],
  );

  const markPaused = useCallback(() => {
    if (!watchRef.current) return;
    watchRef.current = { ...watchRef.current, paused: true };
    void pushPresence(true);
  }, [pushPresence]);

  const markPlaying = useCallback(() => {
    if (!watchRef.current) return;
    watchRef.current = { ...watchRef.current, paused: false };
    void pushPresence(true);
  }, [pushPresence]);

  const clear = useCallback(() => {
    watchRef.current = null;
    browseRef.current = null;
    lastSentRef.current = "";
    if (applicationId) {
      void clearDiscordPresence({ applicationId, largeImageKey });
    }
  }, [applicationId, largeImageKey]);

  useEffect(() => {
    const onVisibility = () => {
      setTabVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!enabled || !applicationId) return;

    if (!tabVisible) {
      lastSentRef.current = "";
      void clearDiscordPresence({ applicationId, largeImageKey });
      return;
    }

    if (mode === "browse" && browseRef.current) {
      void pushPresence(true);
    } else if (watchRef.current) {
      void pushPresence(true);
    }
  }, [applicationId, enabled, largeImageKey, mode, pushPresence, tabVisible]);

  useEffect(() => {
    if (!enabled || !applicationId) {
      clear();
      return;
    }

    if (!tabVisible) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void pushPresence();
    }, UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [applicationId, clear, enabled, pushPresence, tabVisible]);

  return {
    syncProgress,
    syncBrowse,
    markPaused,
    markPlaying,
    clear,
    tabVisible,
    formatEpisodeState: formatDiscordEpisodeState,
    formatBrowseState: formatDiscordBrowseState,
  };
}
