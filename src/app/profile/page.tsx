import { redirect } from "next/navigation";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getProfileFriends } from "@/lib/user-friends";
import { getResolvedProfileStats } from "@/lib/user-profile-resolver";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [statsResult, dbUser, friends] = await Promise.all([
    getResolvedProfileStats({
      shikimoriId: session.user.shikimoriId,
      nickname: session.user.nickname,
      avatar: session.user.avatar,
      isAdmin: session.user.isAdmin,
      memberSince: null,
      localUserId: session.user.id,
      onTrackAnime: true,
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { createdAt: true },
    }),
    getProfileFriends(session.user.shikimoriId),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <ProfileCard
        user={session.user}
        stats={statsResult.stats}
        memberSince={dbUser?.createdAt.toISOString() ?? session.user.id}
        friends={friends}
        dataSource={statsResult.source}
      />
    </div>
  );
}
