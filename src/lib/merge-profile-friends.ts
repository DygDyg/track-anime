import type { SiteFriendListItem } from "@/lib/site-friends";
import type { UserFriendDto } from "@/lib/user-friends";
export type MergedProfileFriend = {
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  lastOnlineAt: string | null;
  onSite: boolean;
  fromShikimori: boolean;
  fromTrackAnime: boolean;
  siteAddedAt: string | null;
  avatarDecorationId: string | null;
  avatarDecorationScale: number;
};

export function mergeProfileFriends(
  shikimoriFriends: UserFriendDto[],
  siteOutgoing: SiteFriendListItem[],
): MergedProfileFriend[] {
  const siteById = new Map(siteOutgoing.map((friend) => [friend.shikimoriId, friend]));
  const merged: MergedProfileFriend[] = [];
  const seen = new Set<number>();

  for (const friend of shikimoriFriends) {
    const site = siteById.get(friend.shikimoriId);
    merged.push({
      shikimoriId: friend.shikimoriId,
      nickname: friend.nickname,
      avatar: friend.avatar,
      lastOnlineAt: friend.lastOnlineAt,
      onSite: friend.onSite,
      fromShikimori: true,
      fromTrackAnime: Boolean(site),
      siteAddedAt: site?.addedAt ?? null,
      avatarDecorationId: site?.avatarDecorationId ?? friend.avatarDecorationId,
      avatarDecorationScale: site?.avatarDecorationScale ?? friend.avatarDecorationScale,
    });
    seen.add(friend.shikimoriId);
  }

  for (const site of siteOutgoing) {
    if (seen.has(site.shikimoriId)) continue;
    merged.push({
      shikimoriId: site.shikimoriId,
      nickname: site.nickname,
      avatar: site.avatar,
      lastOnlineAt: null,
      onSite: true,
      fromShikimori: false,
      fromTrackAnime: true,
      siteAddedAt: site.addedAt,
      avatarDecorationId: site.avatarDecorationId,
      avatarDecorationScale: site.avatarDecorationScale,
    });
  }

  return merged;
}
