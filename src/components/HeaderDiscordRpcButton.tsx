"use client";

import { useCallback, useEffect, useState } from "react";
import { headerControl } from "@/components/header/header-styles";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { useDiscordConfig } from "@/hooks/useDiscordConfig";
import { pingDiscordBridge } from "@/lib/discord-presence";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
function DiscordIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function ActivityBadgeIcon({ className = "h-2.5 w-2.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DiscordRpcIcon({ enabled }: { enabled: boolean }) {
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0" aria-hidden>
      <DiscordIcon className={`h-5 w-5 ${enabled ? "" : "opacity-40"}`} />
      <span
        className={[
          "absolute -bottom-0.5 -right-1 flex h-3 w-3 items-center justify-center rounded-full",
          "bg-[var(--card)] ring-1 ring-[var(--border)]",
          enabled ? "text-accent" : "text-muted opacity-80",
        ].join(" ")}
      >
        <ActivityBadgeIcon className="h-2 w-2" />
      </span>
      {!enabled ? (
        <svg
          viewBox="0 0 24 24"
          className="absolute inset-0 h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
        >
          <path d="M5 5l14 14" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}

const BRIDGE_CHECK_INTERVAL_MS = 15_000;

export function HeaderDiscordRpcButton() {
  const { configured, loading } = useDiscordConfig();
  const { settings, updateSettings, remoteSaving } = useSiteSettings();
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [toggling, setToggling] = useState(false);

  const checkBridge = useCallback(async () => {
    setBridgeOnline(await pingDiscordBridge());
  }, []);

  useEffect(() => {
    if (loading || !configured || !settings.discordPresenceEnabled) {
      setBridgeOnline(false);
      return;
    }

    void checkBridge();
    const intervalId = window.setInterval(() => void checkBridge(), BRIDGE_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkBridge);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkBridge);
    };
  }, [checkBridge, configured, loading, settings.discordPresenceEnabled]);

  if (loading || !configured || !bridgeOnline) return null;

  const enabled = settings.discordPresenceEnabled;
  const busy = toggling || remoteSaving;

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => {
        if (busy) return;
        setToggling(true);
        updateSettings({ discordPresenceEnabled: !enabled });
        window.setTimeout(() => setToggling(false), 400);
      }}
      className={[
        headerControl.icon,
        enabled ? "text-accent hover:text-accent" : "text-muted hover:text-foreground",
        busy ? "cursor-wait opacity-70" : "",
      ].join(" ")}
      aria-label={enabled ? "Отключить Discord Rich Presence" : "Включить Discord Rich Presence"}
      aria-pressed={enabled}
      title={busy ? "Сохранение…" : enabled ? "Discord RPC: включено" : "Discord RPC: выключено"}
    >
      {busy ? <LoadingSpinner size="sm" /> : <DiscordRpcIcon enabled={enabled} />}
    </button>
  );
}
