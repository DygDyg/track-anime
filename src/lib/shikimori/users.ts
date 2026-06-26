import { shikimoriAvatarUrl } from "@/lib/auth/shikimori-avatar";
import { shikimoriAssetUrl, shikimoriFetch } from "@/lib/shikimori/client";

export type ShikimoriUserBrief = {
  id: number;
  nickname: string;
  avatar: string | null;
};

type ShikimoriStatusCount = {
  name: string;
  size: number;
};

export type ShikimoriUserDetails = ShikimoriUserBrief & {
  stats?: {
    full_statuses?: {
      anime?: ShikimoriStatusCount[];
    };
    scores?: {
      anime?: Array<{ name: string; value: number }>;
    };
  };
};

function mapUserBrief(user: {
  id: number;
  nickname: string;
  avatar?: string | null;
}): ShikimoriUserBrief {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: shikimoriAvatarUrl(user.avatar) ?? shikimoriAssetUrl(user.avatar),
  };
}

export async function fetchShikimoriUserById(
  shikimoriId: number,
): Promise<ShikimoriUserDetails | null> {
  try {
    const data = await shikimoriFetch<ShikimoriUserDetails>(`/users/${shikimoriId}`);
    if (!data) return null;
    return {
      ...mapUserBrief(data),
      stats: data.stats,
    };
  } catch (err) {
    console.error("[shikimori-users] fetch user failed:", err);
    return null;
  }
}

export async function searchShikimoriUsers(
  query: string,
  limit = 12,
): Promise<ShikimoriUserBrief[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const data = await shikimoriFetch<ShikimoriUserBrief[]>(
      `/users?search=${encodeURIComponent(trimmed)}&limit=${limit}`,
    );
    return (data ?? []).map(mapUserBrief);
  } catch (err) {
    console.error("[shikimori-users] search failed:", err);
    return [];
  }
}

export function parseShikimoriUserQuery(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}
