"use client";

import { useMemo } from "react";
import { PatternSiteBackground } from "@/components/PatternSiteBackground";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { parsePatternBackgroundId } from "@/lib/pattern-backgrounds";

/** Фон сайта: только процедурные CSS-паттерны (`pattern:*`). */
export function SiteBackground() {
  const { settings } = useSiteSettings();
  const patternId = useMemo(
    () => parsePatternBackgroundId(settings.backgroundImageUrl),
    [settings.backgroundImageUrl],
  );

  if (!patternId) return null;
  return <PatternSiteBackground patternId={patternId} />;
}
