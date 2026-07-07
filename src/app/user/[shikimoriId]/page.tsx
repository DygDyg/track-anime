import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { getSession } from "@/lib/auth/session";
import { parseShikimoriIdParam, userProfilePath } from "@/lib/public-user";
import { buildUserProfilePageMetadata } from "@/lib/site-metadata";
import { getProfileFriends } from "@/lib/user-friends";
import { getProfileSiteFriends, loadLocalProfileFriendStatus } from "@/lib/site-friends";
import {
  getResolvedProfileStats,
  resolveUserProfile,
} from "@/lib/user-profile-resolver";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ shikimoriId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriIdParam(raw);
  if (!shikimoriId) {
    return { title: "Пользователь не найден" };
  }

  const resolved = await resolveUserProfile(shikimoriId);
  if (!resolved) {
    return { title: "Пользователь не найден" };
  }

  return buildUserProfilePageMetadata({
    nickname: resolved.profile.nickname,
    avatar: resolved.profile.avatar,
    canonicalPath: userProfilePath(resolved.profile.shikimoriId),
  });
}

export default async function PublicUserProfilePage({ params }: Props) {
  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriIdParam(raw);
  if (!shikimoriId) notFound();

  const session = await getSession();
  const resolved = await resolveUserProfile(shikimoriId);
  if (!resolved) notFound();

  const { profile, shikimori } = resolved;
  const viewingSelf = session?.user.shikimoriId === shikimoriId;

  const [{ stats, source }, friends, siteFriends, friendStatus] = await Promise.all([
    getResolvedProfileStats(profile, shikimori),
    getProfileFriends(profile.shikimoriId),
    getProfileSiteFriends(profile.shikimoriId, {
      includeIncomingForUserId: viewingSelf ? session?.user.id ?? null : null,
    }),
    viewingSelf
      ? Promise.resolve(null)
      : loadLocalProfileFriendStatus(
          session?.user.id,
          session?.user.shikimoriId,
          profile.shikimoriId,
        ),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      {!viewingSelf && !profile.onTrackAnime ? (
        <p className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Профиль загружен с Shikimori.{" "}
          <Link href="/user" className="font-semibold text-accent hover:underline">
            Найти другого пользователя
          </Link>
        </p>
      ) : null}

      <ProfileCard
        user={{
          id: profile.localUserId ?? undefined,
          shikimoriId: profile.shikimoriId,
          nickname: profile.nickname,
          avatar: profile.avatar,
          isAdmin: profile.isAdmin,
          avatarDecorationId: profile.avatarDecorationId,
          avatarDecorationScale: profile.avatarDecorationScale,
        }}
        stats={stats}
        memberSince={profile.memberSince}
        variant={viewingSelf ? "own" : "public"}
        friends={friends}
        siteFriends={siteFriends}
        showIncomingFriendsTab={viewingSelf}
        showPublicProfileLink={!viewingSelf}
        onTrackAnime={profile.onTrackAnime}
        dataSource={source}
        friendStatus={friendStatus}
      />
    </div>
  );
}
