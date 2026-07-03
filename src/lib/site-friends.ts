import { shikimoriAvatarUrl } from "@/lib/auth/shikimori-avatar";
import { prisma } from "@/lib/prisma";
import type { ProfileFriendStatus } from "@/lib/profile-friend-status";

export type SiteFriendListItem = {
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  addedAt: string;
};

const friendUserSelect = {
  shikimoriId: true,
  nickname: true,
  avatar: true,
} as const;

function mapFriendUser(
  user: { shikimoriId: number; nickname: string; avatar: string | null },
  addedAt: Date,
): SiteFriendListItem {
  return {
    shikimoriId: user.shikimoriId,
    nickname: user.nickname,
    avatar: shikimoriAvatarUrl(user.avatar),
    addedAt: addedAt.toISOString(),
  };
}

export async function resolveLocalUserIdByShikimoriId(
  shikimoriId: number,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { shikimoriId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getSiteFriendsOutgoing(userId: string): Promise<SiteFriendListItem[]> {
  const rows = await prisma.siteFriend.findMany({
    where: { fromUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { toUser: { select: friendUserSelect } },
  });
  return rows.map((row) => mapFriendUser(row.toUser, row.createdAt));
}

export async function getSiteFriendsIncoming(userId: string): Promise<SiteFriendListItem[]> {
  const rows = await prisma.siteFriend.findMany({
    where: { toUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { fromUser: { select: friendUserSelect } },
  });
  return rows.map((row) => mapFriendUser(row.fromUser, row.createdAt));
}

export async function getSiteFriendsOutgoingByShikimoriId(
  shikimoriId: number,
): Promise<SiteFriendListItem[]> {
  const userId = await resolveLocalUserIdByShikimoriId(shikimoriId);
  if (!userId) return [];
  return getSiteFriendsOutgoing(userId);
}

export async function getLocalFriendStatus(
  viewerUserId: string,
  targetShikimoriId: number,
  viewerShikimoriId: number,
): Promise<ProfileFriendStatus> {
  if (viewerShikimoriId === targetShikimoriId) return "self";

  const targetUserId = await resolveLocalUserIdByShikimoriId(targetShikimoriId);
  if (!targetUserId) return "none";

  const existing = await prisma.siteFriend.findUnique({
    where: {
      fromUserId_toUserId: {
        fromUserId: viewerUserId,
        toUserId: targetUserId,
      },
    },
  });

  return existing ? "friends" : "none";
}

export async function addSiteFriend(
  fromUserId: string,
  targetShikimoriId: number,
): Promise<{ status: ProfileFriendStatus }> {
  const targetUserId = await resolveLocalUserIdByShikimoriId(targetShikimoriId);
  if (!targetUserId) {
    throw new Error("Пользователь не зарегистрирован на Track Anime");
  }
  if (fromUserId === targetUserId) {
    throw new Error("Нельзя добавить себя в друзья");
  }

  await prisma.siteFriend.upsert({
    where: {
      fromUserId_toUserId: {
        fromUserId,
        toUserId: targetUserId,
      },
    },
    create: { fromUserId, toUserId: targetUserId },
    update: {},
  });

  return { status: "friends" };
}

export async function removeSiteFriend(
  fromUserId: string,
  targetShikimoriId: number,
): Promise<{ status: ProfileFriendStatus }> {
  const targetUserId = await resolveLocalUserIdByShikimoriId(targetShikimoriId);
  if (!targetUserId) {
    return { status: "none" };
  }

  await prisma.siteFriend.deleteMany({
    where: { fromUserId, toUserId: targetUserId },
  });

  return { status: "none" };
}

export async function removeSiteFriendIncoming(
  toUserId: string,
  fromShikimoriId: number,
): Promise<void> {
  const fromUserId = await resolveLocalUserIdByShikimoriId(fromShikimoriId);
  if (!fromUserId) return;

  await prisma.siteFriend.deleteMany({
    where: { fromUserId, toUserId },
  });
}

export async function loadLocalProfileFriendStatus(
  viewerUserId: string | undefined,
  viewerShikimoriId: number | undefined,
  targetShikimoriId: number,
): Promise<ProfileFriendStatus | null> {
  if (!viewerUserId || viewerShikimoriId == null) return null;
  if (viewerShikimoriId === targetShikimoriId) return null;
  return getLocalFriendStatus(viewerUserId, targetShikimoriId, viewerShikimoriId);
}

export type ProfileSiteFriendsData = {
  outgoing: SiteFriendListItem[];
  incoming: SiteFriendListItem[];
};

export async function getProfileSiteFriends(
  profileShikimoriId: number,
  options?: { includeIncomingForUserId?: string | null },
): Promise<ProfileSiteFriendsData> {
  const profileUserId = await resolveLocalUserIdByShikimoriId(profileShikimoriId);
  const outgoing = profileUserId ? await getSiteFriendsOutgoing(profileUserId) : [];
  const incoming =
    options?.includeIncomingForUserId != null
      ? await getSiteFriendsIncoming(options.includeIncomingForUserId)
      : [];

  return { outgoing, incoming };
}
