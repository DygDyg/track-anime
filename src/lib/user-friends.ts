import { prisma } from "@/lib/prisma";
import { fetchUserFriends, friendAvatarUrl } from "@/lib/shikimori/friends";

export type UserFriendDto = {
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  lastOnlineAt: string | null;
  onSite: boolean;
};

export type ProfileFriendsData = {
  friends: UserFriendDto[];
  error: string | null;
};

const PROFILE_FRIENDS_LIMIT = 24;

export async function getProfileFriends(shikimoriUserId: number): Promise<ProfileFriendsData> {
  try {
    const raw = await fetchUserFriends(shikimoriUserId, { limit: PROFILE_FRIENDS_LIMIT });
    if (raw.length === 0) {
      return { friends: [], error: null };
    }

    const shikimoriIds = raw.map((friend) => friend.id);
    const localUsers = await prisma.user.findMany({
      where: { shikimoriId: { in: shikimoriIds } },
      select: { shikimoriId: true },
    });
    const onSiteIds = new Set(localUsers.map((user) => user.shikimoriId));

    return {
      friends: raw.map((friend) => ({
        shikimoriId: friend.id,
        nickname: friend.nickname,
        avatar: friendAvatarUrl(friend),
        lastOnlineAt: friend.last_online_at ?? null,
        onSite: onSiteIds.has(friend.id),
      })),
      error: null,
    };
  } catch (err) {
    console.error("[profile-friends] Shikimori friends fetch failed:", err);
    return {
      friends: [],
      error: "Не удалось загрузить список друзей с Shikimori",
    };
  }
}
