"use client";

import { useEffect, useState } from "react";
import {
  parseTranslationIntroOffsets,
  type TranslationIntroOffsets,
} from "@/lib/translation-intro-offset";

export function useForcedTranslationIntroOffsets(): TranslationIntroOffsets {
  const [forcedOffsets, setForcedOffsets] = useState<TranslationIntroOffsets>({});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/settings/intro-offsets", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { forcedOffsets?: unknown };
        if (!cancelled) {
          setForcedOffsets(parseTranslationIntroOffsets(data.forcedOffsets));
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return forcedOffsets;
}
