"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { ProfileFrame } from "@/components/profile/ProfileFrame";
import { getProfileFrame, profileFrameCssVars } from "@/lib/profile-frames";

export function ProfileFrameShell({
  frameId,
  live = false,
  children,
}: {
  frameId?: string | null;
  live?: boolean;
  children: ReactNode;
}) {
  const { settings, settingsReady } = useSiteSettings();
  const resolvedId = live && settingsReady ? settings.profileFrameId : frameId;
  const frame = getProfileFrame(resolvedId);

  if (!frame) {
    return <div className="relative">{children}</div>;
  }

  return (
    <div className="profile-frame-shell" style={profileFrameCssVars(frame) as CSSProperties}>
      <ProfileFrame frame={frame} />
      <div className="profile-frame-card">{children}</div>
    </div>
  );
}
