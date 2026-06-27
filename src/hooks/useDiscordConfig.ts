"use client";

import { useEffect, useState } from "react";

type DiscordPublicConfig = {
  applicationId: string | null;
  largeImageKey: string;
  bridgeDownloadUrl: string | null;
};

export function useDiscordConfig() {
  const [config, setConfig] = useState<DiscordPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/discord/config", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DiscordPublicConfig;
        if (!cancelled) setConfig(data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    applicationId: config?.applicationId ?? null,
    largeImageKey: config?.largeImageKey ?? "logo",
    bridgeDownloadUrl: config?.bridgeDownloadUrl ?? null,
    configured: Boolean(config?.applicationId),
    loading,
  };
}
