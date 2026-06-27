import { prisma } from "@/lib/prisma";
import { shikimoriFetch } from "@/lib/shikimori/client";

export function isPlaceholderUserNickname(nickname: string, shikimoriId: number): boolean {
  return nickname === `user_${shikimoriId}`;
}

export async function listPlaceholderUsers(limit?: number) {
  const rows = await prisma.user.findMany({
    where: { nickname: { startsWith: "user_" } },
    select: { id: true, shikimoriId: true, nickname: true, avatar: true },
    orderBy: { shikimoriId: "asc" },
  });

  const placeholders = rows.filter((row) => isPlaceholderUserNickname(row.nickname, row.shikimoriId));
  return limit ? placeholders.slice(0, limit) : placeholders;
}

export type UserProfileBackfillResult = {
  shikimoriId: number;
  status: "updated" | "not_found" | "unchanged" | "error";
  nickname?: string;
  error?: string;
};

type ShikimoriUserResponse = {
  id: number;
  nickname: string;
  avatar?: string | null;
};

export async function backfillUserProfileFromShikimori(
  user: { id: string; shikimoriId: number; nickname: string; avatar: string | null },
  options?: { dryRun?: boolean },
): Promise<UserProfileBackfillResult> {
  if (!isPlaceholderUserNickname(user.nickname, user.shikimoriId)) {
    return { shikimoriId: user.shikimoriId, status: "unchanged" };
  }

  try {
    const remote = await shikimoriFetch<ShikimoriUserResponse>(`/users/${user.shikimoriId}`);
    if (!remote) {
      return { shikimoriId: user.shikimoriId, status: "not_found" };
    }

    const nextNickname = remote.nickname.trim();
    const nextAvatar = remote.avatar ?? null;
    const unchanged = nextNickname === user.nickname && nextAvatar === user.avatar;

    if (unchanged) {
      return { shikimoriId: user.shikimoriId, status: "unchanged", nickname: nextNickname };
    }

    if (!options?.dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          nickname: nextNickname,
          avatar: nextAvatar,
        },
      });
    }

    return { shikimoriId: user.shikimoriId, status: "updated", nickname: nextNickname };
  } catch (error) {
    return {
      shikimoriId: user.shikimoriId,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function backfillPlaceholderUserProfiles(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<UserProfileBackfillResult[]> {
  const users = await listPlaceholderUsers(options?.limit);
  const results: UserProfileBackfillResult[] = [];

  for (const user of users) {
    results.push(await backfillUserProfileFromShikimori(user, options));
  }

  return results;
}
