import { prisma } from "@/lib/prisma";
import { fetchUserFriends, friendAvatarUrl } from "@/lib/shikimori/friends";
import { normalizeSiteSettings, AVATAR_DECORATION_SCALE_DEFAULT } from "@/lib/site-settings";

export type UserFriendDto = {
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  lastOnlineAt: string | null;
  onSite: boolean;
  avatarDecorationId: string | null;
  avatarDecorationScale: number;
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
      select: { shikimoriId: true, siteSettings: true },
    });
    const localById = new Map(
      localUsers.map((user) => {
        const settings = normalizeSiteSettings(user.siteSettings);
        return [
          user.shikimoriId,
          {
            avatarDecorationId: settings.avatarDecorationId,
            avatarDecorationScale: settings.avatarDecorationScale,
          },
        ] as const;
      }),
    );

    return {
      friends: raw.map((friend) => {
        const local = localById.get(friend.id);
        return {
          shikimoriId: friend.id,
          nickname: friend.nickname,
          avatar: friendAvatarUrl(friend),
          lastOnlineAt: friend.last_online_at ?? null,
          onSite: local != null,
          avatarDecorationId: local?.avatarDecorationId ?? null,
          avatarDecorationScale: local?.avatarDecorationScale ?? AVATAR_DECORATION_SCALE_DEFAULT,
        };
      }),
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
