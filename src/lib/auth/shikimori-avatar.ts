import { shikimoriAssetUrl } from "@/lib/shikimori/client";

export function shikimoriAvatarUrl(avatar: string | null | undefined): string | null {
  return shikimoriAssetUrl(avatar);
}
