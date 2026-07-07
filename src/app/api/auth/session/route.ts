import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { needsShikimoriFriendsReconnect, isFriendsScopeConfigured } from "@/lib/auth/shikimori-scope";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({
      user: null,
      needsShikimoriFriendsReconnect: false,
      shikimoriFriendsEnabled: isFriendsScopeConfigured(),
    });
  }

  const account = await prisma.shikimoriAccount.findUnique({
    where: { userId: session.user.id },
    select: { scope: true },
  });

  return NextResponse.json({
    user: session.user,
    needsShikimoriFriendsReconnect: needsShikimoriFriendsReconnect(account?.scope),
    shikimoriFriendsEnabled: isFriendsScopeConfigured(),
  });
}
