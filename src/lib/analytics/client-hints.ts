"use client";

import { isTrackAnimeAndroidApp } from "@/lib/android-app";

export type AnalyticsClientHintsPayload = {
  isPwa: boolean;
  isTv: boolean;
  model?: string;
  mobile?: boolean;
};

function detectPwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function detectTv(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: tv)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

type NavigatorUaData = {
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; mobile?: boolean }>;
};

/** Client Hints + PWA/TV флаги для analytics beacon/play. */
export async function collectAnalyticsClientHints(): Promise<AnalyticsClientHintsPayload> {
  const payload: AnalyticsClientHintsPayload = {
    isPwa: detectPwa() && !isTrackAnimeAndroidApp(),
    isTv: detectTv(),
  };

  try {
    const uaData = (window.navigator as Navigator & { userAgentData?: NavigatorUaData }).userAgentData;
    if (uaData?.mobile === true) payload.mobile = true;
    if (typeof uaData?.getHighEntropyValues === "function") {
      const values = await uaData.getHighEntropyValues(["model", "mobile"]);
      if (typeof values.model === "string" && values.model.trim()) {
        payload.model = values.model.trim().slice(0, 80);
      }
      if (values.mobile === true) payload.mobile = true;
    }
  } catch {
    /* ignore */
  }

  return payload;
}
