"use client";

/**
 * Ensures `window.__TA_HOLIDAY__` exists for init / client resolve.
 * Server already injects the same payload via layout script when possible.
 */
import { useEffect } from "react";
import type { HolidayThemePublicConfig } from "@/lib/holiday-theme";

export function HolidayThemeBootstrap({ config }: { config: HolidayThemePublicConfig }) {
  useEffect(() => {
    window.__TA_HOLIDAY__ = config;
  }, [config]);

  return null;
}
