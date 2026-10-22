"use client";

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { ProfileFrame } from "@/components/profile/ProfileFrame";
import { getProfileFrame, profileFrameCssVars } from "@/lib/profile-frames";

type ProfileMenuPanelProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** Фон/бордер/тень — на карточке (как ProfileCard), не на оболочке рамки. */
export const profileMenuChromeClass =
  "site-header-bg rounded-xl border border-border/90 py-1 shadow-lg shadow-black/30 backdrop-blur-lg backdrop-saturate-150";

/**
 * Панель меню профиля.
 * Слои Discord: back (top/glow/sides) → карточка → front (head/tail).
 * Позицию (fixed + portal) задаёт className/style вызывающего.
 */
export const ProfileMenuPanel = forwardRef<HTMLDivElement, ProfileMenuPanelProps>(
  function ProfileMenuPanel({ children, className = "", style }, ref) {
    const { settings } = useSiteSettings();
    const frame = getProfileFrame(settings.profileFrameId);

    if (!frame) {
      return (
        <div
          ref={ref}
          role="menu"
          className={[profileMenuChromeClass, className].filter(Boolean).join(" ")}
          style={style}
        >
          {children}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        role="menu"
        className={["profile-menu-panel", className].filter(Boolean).join(" ")}
        style={{ ...style, ...(profileFrameCssVars(frame) as CSSProperties) }}
      >
        <ProfileFrame frame={frame} />
        <div className={`profile-menu-frame-card ${profileMenuChromeClass}`}>{children}</div>
      </div>
    );
  },
);
