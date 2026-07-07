import type { CSSProperties } from "react";
import {
  AVATAR_DECORATION_SCALE_DEFAULT,
  normalizeAvatarDecorationScale,
} from "@/lib/site-settings";

/**
 * Нормализованный масштаб украшения — одно значение ползунка везде даёт одинаковую
 * долю рамки относительно аватарки (см. .avatar-decoration-overlay в globals.css).
 */
export function resolveAvatarDecorationScale(userScale: number | undefined): number {
  return normalizeAvatarDecorationScale(userScale ?? AVATAR_DECORATION_SCALE_DEFAULT);
}

export function avatarDecorationHostStyle(userScale: number | undefined): CSSProperties {
  return {
    ["--avatar-decoration-scale" as string]: String(resolveAvatarDecorationScale(userScale)),
  };
}

export type AvatarDecorationDisplaySize =
  | "xs"
  | "sm"
  | "md"
  | "preview"
  | "fab"
  | "profile"
  | "friend";
