import { shikimoriAssetUrl, shikimoriFetch } from "@/lib/shikimori/client";
import type { ShikimoriImage } from "@/lib/shikimori/types";

export type ShikimoriFriend = {
  id: number;
  nickname: string;
  avatar?: string | null;
  image?: ShikimoriImage | null;
  last_online_at?: string | null;
  url?: string;
};

export async function fetchUserFriends(
  shikimoriUserId: number,
  options?: { limit?: number; page?: number },
): Promise<ShikimoriFriend[]> {
  const limit = options?.limit ?? 24;
  const page = options?.page ?? 1;
  const data = await shikimoriFetch<ShikimoriFriend[]>(
    `/users/${shikimoriUserId}/friends?limit=${limit}&page=${page}`,
  );
  return data ?? [];
}

export function friendAvatarUrl(friend: ShikimoriFriend): string | null {
  if (friend.avatar) return shikimoriAssetUrl(friend.avatar);
  const image = friend.image;
  if (!image) return null;
  return shikimoriAssetUrl(image.x48 ?? image.preview ?? image.original ?? null);
}
