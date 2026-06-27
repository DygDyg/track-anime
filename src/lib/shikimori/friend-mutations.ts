import { ShikimoriAuthError, shikimoriAuthFetch } from "@/lib/shikimori/auth-client";
import {
  normalizeProfileFriendStatus,
  type ProfileFriendStatus,
} from "@/lib/profile-friend-status";

type ShikimoriFriendNotice = {
  notice?: string;
};

type ShikimoriUserWithFriends = {
  in_friends?: boolean | string | null;
};

export async function fetchViewerFriendStatus(
  viewerUserId: string,
  targetShikimoriId: number,
): Promise<boolean | string | null> {
  const data = await shikimoriAuthFetch<ShikimoriUserWithFriends>(
    viewerUserId,
    `/users/${targetShikimoriId}`,
  );
  return data?.in_friends ?? null;
}

export async function addShikimoriFriend(
  viewerUserId: string,
  targetShikimoriId: number,
): Promise<ShikimoriFriendNotice | undefined> {
  return shikimoriAuthFetch<ShikimoriFriendNotice>(
    viewerUserId,
    `/friends/${targetShikimoriId}`,
    { method: "POST" },
  );
}

export async function removeShikimoriFriend(
  viewerUserId: string,
  targetShikimoriId: number,
): Promise<ShikimoriFriendNotice | undefined> {
  return shikimoriAuthFetch<ShikimoriFriendNotice>(
    viewerUserId,
    `/friends/${targetShikimoriId}`,
    { method: "DELETE" },
  );
}

export function isFriendMutationAuthError(error: unknown): error is ShikimoriAuthError {
  return error instanceof ShikimoriAuthError;
}

export function isFriendScopeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Shikimori API 403: \/friends\//.test(error.message);
}

export async function loadProfileFriendStatus(
  viewerUserId: string | undefined,
  viewerShikimoriId: number | undefined,
  targetShikimoriId: number,
): Promise<ProfileFriendStatus | null> {
  if (!viewerUserId || viewerShikimoriId === targetShikimoriId) return null;
  try {
    const raw = await fetchViewerFriendStatus(viewerUserId, targetShikimoriId);
    return normalizeProfileFriendStatus(raw);
  } catch {
    return null;
  }
}
