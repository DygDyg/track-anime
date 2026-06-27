import { shikimoriAssetUrl } from "@/lib/shikimori/client";

const AVATAR_SIZE_SEGMENT = /\/x(\d+)\//;

export function shikimoriAvatarUrl(
  avatar: string | null | undefined,
  options?: { size?: "default" | "large" },
): string | null {
  const url = shikimoriAssetUrl(avatar);
  if (!url) return null;
  if (options?.size !== "large") return url;
  if (AVATAR_SIZE_SEGMENT.test(url)) {
    return url.replace(AVATAR_SIZE_SEGMENT, "/x160/");
  }
  return url;
}

export function shikimoriAvatarUrlLarge(avatar: string | null | undefined): string | null {
  return shikimoriAvatarUrl(avatar, { size: "large" });
}
