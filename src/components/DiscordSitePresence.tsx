"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { useDiscordConfig } from "@/hooks/useDiscordConfig";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import {
  buildDiscordPageUrl,
  isAnimeWatchPath,
  resolveDiscordSitePageLabel,
} from "@/lib/discord-site-pages";

/** Rich Presence для разделов сайта (не страница просмотра аниме). */
export function DiscordSitePresence() {
  const pathname = usePathname();
  const { settings } = useSiteSettings();
  const { applicationId, largeImageKey, configured } = useDiscordConfig();

  const showSitePage = settings.discordPresenceShowSitePage;
  const enabled =
    settings.discordPresenceEnabled && configured && showSitePage && !isAnimeWatchPath(pathname);

  const sitePageLabel = resolveDiscordSitePageLabel(pathname);
  const pageUrl = buildDiscordPageUrl(pathname);

  const { syncBrowse } = useDiscordPresence({
    enabled,
    applicationId,
    largeImageKey,
    mode: "browse",
    openButtonEnabled: settings.discordPresenceOpenButtonEnabled,
    pageUrl,
  });

  useEffect(() => {
    if (!enabled) return;
    syncBrowse({ sitePageLabel, pageUrl });
  }, [enabled, pageUrl, sitePageLabel, syncBrowse]);

  return null;
}
