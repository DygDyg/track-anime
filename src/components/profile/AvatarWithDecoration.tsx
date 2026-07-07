"use client";

import { shikimoriAvatarUrlLarge } from "@/lib/auth/shikimori-avatar";
import { avatarDecorationUrl, type AvatarDecorationVariant } from "@/lib/avatar-decorations";
import {
  avatarDecorationHostStyle,
  type AvatarDecorationDisplaySize,
} from "@/lib/avatar-decoration-display";
import { useSiteSettings } from "@/components/SiteSettingsProvider";

export type AvatarWithDecorationSize = AvatarDecorationDisplaySize;

const SIZE_CLASS: Record<AvatarWithDecorationSize, string> = {
  xs: "h-7 w-7",
  sm: "h-10 w-10",
  md: "h-12 w-12",
  preview: "h-28 w-28 sm:h-32 sm:w-32",
  fab: "h-full w-full",
  profile: "h-32 w-32 sm:h-36 sm:w-36",
  friend: "h-11 w-11",
};

const FALLBACK_TEXT: Record<AvatarWithDecorationSize, string> = {
  xs: "text-xs font-semibold",
  sm: "text-sm font-semibold",
  md: "text-base font-semibold",
  preview: "text-4xl font-bold sm:text-5xl",
  fab: "text-lg font-semibold",
  profile: "text-5xl font-bold sm:text-6xl",
  friend: "text-sm font-bold",
};

function resolveDecorationVariant(reduceMotion: boolean): AvatarDecorationVariant {
  return reduceMotion ? "display" : "full";
}

type AvatarWithDecorationProps = {
  avatar: string | null | undefined;
  nickname: string;
  decorationId?: string | null;
  decorationScale?: number;
  size?: AvatarWithDecorationSize;
  className?: string;
  /** Скрыть overlay (например, когда он рисуется снаружи кнопки FAB) */
  hideDecoration?: boolean;
  decorationClassName?: string;
};

export function AvatarWithDecoration({
  avatar,
  nickname,
  decorationId = null,
  decorationScale,
  size = "sm",
  className = "",
  hideDecoration = false,
  decorationClassName = "avatar-decoration-overlay",
}: AvatarWithDecorationProps) {
  const { settings } = useSiteSettings();
  const avatarSrc = shikimoriAvatarUrlLarge(avatar);
  const decorationSrc = hideDecoration
    ? null
    : avatarDecorationUrl(decorationId, resolveDecorationVariant(settings.reduceMotion));
  const initial = nickname.slice(0, 1).toUpperCase();
  const hostStyle = avatarDecorationHostStyle(decorationScale);

  return (
    <div
      className={["avatar-decoration-host relative shrink-0", SIZE_CLASS[size], className].join(" ")}
      style={hostStyle}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-card">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="eager"
          />
        ) : (
          <span
            className={[
              "flex h-full w-full items-center justify-center bg-accent/15 text-accent",
              FALLBACK_TEXT[size],
            ].join(" ")}
          >
            {initial}
          </span>
        )}
      </div>

      {decorationSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={decorationSrc}
          alt=""
          aria-hidden
          className={decorationClassName}
          decoding="async"
        />
      ) : null}
    </div>
  );
}

export function AvatarDecorationOverlay({
  decorationId,
  decorationScale,
  className = "avatar-decoration-overlay",
}: {
  decorationId?: string | null;
  decorationScale?: number;
  className?: string;
}) {
  const { settings } = useSiteSettings();
  const decorationSrc = avatarDecorationUrl(
    decorationId,
    resolveDecorationVariant(settings.reduceMotion),
  );
  if (!decorationSrc) return null;

  return (
    <div
      className="avatar-decoration-host pointer-events-none absolute inset-0"
      style={avatarDecorationHostStyle(decorationScale)}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={decorationSrc} alt="" className={className} decoding="async" />
    </div>
  );
}
