import { prisma } from "@/lib/prisma";
import {
  isFriendsScopeConfigured,
  needsShikimoriFriendsReconnect,
  SHIKIMORI_FRIENDS_RECONNECT_URL,
  SHIKIMORI_FRIENDS_SCOPE_ERROR,
  SHIKIMORI_FRIENDS_UNAVAILABLE_MESSAGE,
} from "@/lib/auth/shikimori-scope";

export type FriendsScopeCheck =
  | { ok: true }
  | { ok: false; error: string; reconnectUrl?: string; unavailable?: boolean };

export async function checkViewerFriendsScope(userId: string): Promise<FriendsScopeCheck> {
  if (!isFriendsScopeConfigured()) {
    return {
      ok: false,
      error: SHIKIMORI_FRIENDS_UNAVAILABLE_MESSAGE,
      unavailable: true,
    };
  }

  const account = await prisma.shikimoriAccount.findUnique({
    where: { userId },
    select: { scope: true },
  });

  if (!needsShikimoriFriendsReconnect(account?.scope)) {
    return { ok: true };
  }

  return {
    ok: false,
    error: SHIKIMORI_FRIENDS_SCOPE_ERROR,
    reconnectUrl: SHIKIMORI_FRIENDS_RECONNECT_URL,
  };
}

export function friendsScopeErrorPayload(check: Extract<FriendsScopeCheck, { ok: false }>) {
  return {
    error: check.error,
    ...(check.reconnectUrl ? { reconnectUrl: check.reconnectUrl } : {}),
    ...(check.unavailable ? { unavailable: true } : {}),
  };
}

export function friendsScopeReconnectPayload() {
  return friendsScopeErrorPayload({
    ok: false,
    error: SHIKIMORI_FRIENDS_SCOPE_ERROR,
    reconnectUrl: SHIKIMORI_FRIENDS_RECONNECT_URL,
  });
}
