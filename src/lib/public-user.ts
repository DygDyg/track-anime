import { isBootstrapAdmin } from "@/lib/auth/config";
import { shikimoriAvatarUrl } from "@/lib/auth/shikimori-avatar";
import { normalizeSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";

export type PublicUserProfile = {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  createdAt: Date;
  avatarDecorationId: string | null;
  avatarDecorationScale: number;
};

export function parseShikimoriIdParam(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function userProfilePath(shikimoriId: number): string {
  return `/user/${shikimoriId}`;
}

export function userFavoritesPath(shikimoriId: number, tab?: string): string {
  const base = `/user/${shikimoriId}/favorites`;
  if (!tab || tab === "watching") return base;
  return `${base}?tab=${encodeURIComponent(tab)}`;
}

export async function getPublicUserByShikimoriId(
  shikimoriId: number,
): Promise<PublicUserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { shikimoriId },
    select: {
      id: true,
      shikimoriId: true,
      nickname: true,
      avatar: true,
      isAdmin: true,
      createdAt: true,
      siteSettings: true,
    },
  });

  if (!user) return null;

  const siteSettings = normalizeSiteSettings(user.siteSettings);

  return {
    id: user.id,
    shikimoriId: user.shikimoriId,
    nickname: user.nickname,
    avatar: shikimoriAvatarUrl(user.avatar),
    isAdmin: user.isAdmin || isBootstrapAdmin(user.shikimoriId),
    createdAt: user.createdAt,
    avatarDecorationId: siteSettings.avatarDecorationId,
    avatarDecorationScale: siteSettings.avatarDecorationScale,
  };
}
