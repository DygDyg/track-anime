"use client";

import { AvatarWithDecoration } from "@/components/profile/AvatarWithDecoration";
import { ProfileFrame } from "@/components/profile/ProfileFrame";
import { getProfileFrame, profileFrameCssVars } from "@/lib/profile-frames";
import type { CSSProperties } from "react";

type Size = "hero" | "tile";

const SIZE: Record<
  Size,
  {
    shell: string;
    avatar: "xs" | "sm";
    pad: string;
    name: string;
    sub: string;
    bars: boolean;
  }
> = {
  hero: {
    shell: "w-[min(100%,13.5rem)]",
    avatar: "sm",
    pad: "px-3 py-3",
    name: "text-sm font-semibold",
    sub: "text-[11px] text-muted",
    bars: true,
  },
  tile: {
    shell: "w-[4.75rem]",
    avatar: "xs",
    pad: "px-1.5 py-1.5",
    name: "text-[9px] font-semibold leading-tight",
    sub: "text-[8px] text-muted leading-tight",
    bars: false,
  },
};

export function ProfileFramePreview({
  frameId,
  nickname,
  avatar,
  size = "hero",
  className = "",
}: {
  frameId: string | null | undefined;
  nickname: string;
  avatar: string | null | undefined;
  size?: Size;
  className?: string;
}) {
  const frame = getProfileFrame(frameId);
  const ui = SIZE[size];
  const shortName = nickname.trim() || "Вы";

  const card = (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md shadow-black/20">
      <div
        className={`flex items-center gap-2 bg-gradient-to-br from-accent/25 via-accent/5 to-transparent ${ui.pad}`}
      >
        <AvatarWithDecoration
          avatar={avatar}
          nickname={shortName}
          size={ui.avatar}
          hideDecoration
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-foreground ${ui.name}`}>{shortName}</p>
          <p className={`truncate ${ui.sub}`}>Профиль</p>
        </div>
      </div>
      {ui.bars ? (
        <div className="space-y-1.5 px-3 pb-3 pt-2">
          <div className="h-1.5 w-[78%] rounded-full bg-border/70" />
          <div className="h-1.5 w-[55%] rounded-full bg-border/45" />
          <div className="h-1.5 w-[66%] rounded-full bg-border/35" />
        </div>
      ) : (
        <div className="px-1.5 pb-1.5">
          <div className="h-1 w-full rounded-full bg-border/50" />
        </div>
      )}
    </div>
  );

  if (!frame) {
    return <div className={`${ui.shell} ${className}`}>{card}</div>;
  }

  return (
    <div
      className={`profile-frame-shell ${ui.shell} ${className}`}
      style={profileFrameCssVars(frame) as CSSProperties}
    >
      <ProfileFrame frame={frame} />
      <div className="profile-frame-card">{card}</div>
    </div>
  );
}
