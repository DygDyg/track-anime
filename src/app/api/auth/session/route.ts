import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestHostname } from "@/lib/auth/request-origin";
import { needsShikimoriFriendsReconnect, isFriendsScopeConfigured } from "@/lib/auth/shikimori-scope";
import {
  isSecureRequest,
  lookupSession,
  sessionCookieOptions,
  touchSessionIfNeeded,
} from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const looked = await lookupSession();
  if (!looked) {
    return NextResponse.json({
      user: null,
      needsShikimoriFriendsReconnect: false,
      shikimoriFriendsEnabled: isFriendsScopeConfigured(),
    });
  }

  const nextExpiresAt = await touchSessionIfNeeded(looked.sessionId, looked.expiresAt);
  const renewed = nextExpiresAt.getTime() !== looked.expiresAt.getTime();

  const account = await prisma.shikimoriAccount.findUnique({
    where: { userId: looked.user.id },
    select: { scope: true },
  });

  const response = NextResponse.json({
    user: looked.user,
    needsShikimoriFriendsReconnect: needsShikimoriFriendsReconnect(account?.scope),
    shikimoriFriendsEnabled: isFriendsScopeConfigured(),
  });

  if (renewed) {
    response.cookies.set(
      sessionCookieOptions(looked.token, {
        secure: isSecureRequest(request),
        hostname: getRequestHostname(request),
      }),
    );
  }

  return response;
}
