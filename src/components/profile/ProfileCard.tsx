import Link from "next/link";
import { RelativeTime } from "@/components/RelativeTime";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileFriendButton } from "@/components/profile/ProfileFriendButton";
import { ProfileFriendsSection } from "@/components/profile/ProfileFriendsSection";
import { ProfileSiteSettingsNote } from "@/components/profile/ProfileSiteSettingsNote";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import type { AuthUser } from "@/lib/auth/session";
import { userFavoritesPath, userProfilePath } from "@/lib/public-user";
import type { ProfileFriendStatus } from "@/lib/profile-friend-status";
import { LIST_STATUS_LABELS, LIST_STATUS_TABS } from "@/lib/shikimori/user-rates.types";
import type { ProfileFriendsData } from "@/lib/user-friends";
import type { ProfileSiteFriendsData } from "@/lib/site-friends";
import type { UserProfileStatsDto } from "@/lib/user-profile-stats";

type ProfileUser = Pick<AuthUser, "shikimoriId" | "nickname" | "avatar" | "isAdmin"> &
  Partial<Pick<AuthUser, "id">> & {
    avatarDecorationId?: string | null;
    avatarDecorationScale?: number;
  };

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatTile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
    </>
  );

  const className =
    "rounded-xl border border-border bg-background/60 p-3 transition hover:border-accent/40 hover:bg-surface-dim/80";

  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

function OwnSyncStatus({ stats }: { stats: UserProfileStatsDto["listSync"] }) {
  if (stats.error) {
    return (
      <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
        Ошибка синхронизации списка: {stats.error}. Показаны сохранённые данные.
      </p>
    );
  }

  if (!stats.lastSyncedAt) {
    return (
      <p className="text-sm text-muted">
        Список ещё не синхронизировался с Shikimori. Откройте{" "}
        <Link href="/favorites" className="font-semibold text-accent hover:underline">
          избранное
        </Link>
        , чтобы подтянуть данные.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted">
      Список Shikimori{" "}
      {stats.stale ? (
        <>
          устарел — обновится при следующем открытии{" "}
          <Link href="/favorites" className="font-semibold text-accent hover:underline">
            избранного
          </Link>
        </>
      ) : (
        <>в кеше</>
      )}
      . Последняя синхронизация:{" "}
      <RelativeTime date={stats.lastSyncedAt} className="font-semibold text-foreground" />
      {stats.stale ? null : (
        <span className="text-muted"> (актуально ~{stats.cacheTtlMinutes} мин)</span>
      )}
      {stats.mangaBookmarkCount > 0 ? (
        <span className="text-muted">
          {" "}
          · манга/ранобэ в закладках Shikimori: {stats.mangaBookmarkCount}
        </span>
      ) : null}
    </p>
  );
}

function PublicSyncStatus({
  stats,
  dataSource,
  onTrackAnime,
}: {
  stats: UserProfileStatsDto["listSync"];
  dataSource: "site" | "shikimori";
  onTrackAnime: boolean;
}) {
  if (dataSource === "shikimori") {
    return (
      <p className="text-sm text-muted">
        Списки и статистика загружены с Shikimori
        {stats.lastSyncedAt ? (
          <>
            {" "}
            · обновлено{" "}
            <RelativeTime date={stats.lastSyncedAt} className="font-semibold text-foreground" />
          </>
        ) : null}
        {stats.mangaBookmarkCount > 0 ? (
          <span className="text-muted">
            {" "}
            · манга/ранобэ в закладках: {stats.mangaBookmarkCount}
          </span>
        ) : null}
        {!onTrackAnime ? (
          <span className="text-muted"> · пользователь не входил на Track Anime</span>
        ) : null}
      </p>
    );
  }

  if (!stats.lastSyncedAt) {
    return (
      <p className="text-sm text-muted">
        Списки этого пользователя ещё не синхронизировались с Track Anime. Показаны данные с Shikimori.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted">
      Списки сохранены на сервере. Последнее обновление:{" "}
      <RelativeTime date={stats.lastSyncedAt} className="font-semibold text-foreground" />
      {stats.mangaBookmarkCount > 0 ? (
        <span className="text-muted">
          {" "}
          · манга/ранобэ в закладках Shikimori: {stats.mangaBookmarkCount}
        </span>
      ) : null}
    </p>
  );
}

export function ProfileCard({
  user,
  stats,
  memberSince,
  variant = "own",
  friends,
  siteFriends,
  showIncomingFriendsTab = false,
  showPublicProfileLink = true,
  onTrackAnime = true,
  dataSource = "site",
  friendStatus = null,
}: {
  user: ProfileUser;
  stats: UserProfileStatsDto;
  memberSince: string | null;
  variant?: "own" | "public";
  friends: ProfileFriendsData;
  siteFriends: ProfileSiteFriendsData;
  showIncomingFriendsTab?: boolean;
  showPublicProfileLink?: boolean;
  onTrackAnime?: boolean;
  dataSource?: "site" | "shikimori";
  friendStatus?: ProfileFriendStatus | null;
}) {
  const isOwn = variant === "own";
  const favoritesHref = isOwn ? "/favorites" : userFavoritesPath(user.shikimoriId);
  const favoritesTabHref = (tab: string) =>
    isOwn ? `/favorites?tab=${tab}` : userFavoritesPath(user.shikimoriId, tab);
  const publicProfileHref = userProfilePath(user.shikimoriId);

  const topStatuses = LIST_STATUS_TABS.filter((tab) => stats.listCounts[tab] > 0).slice(0, 3);
  const highlightStatuses =
    topStatuses.length > 0 ? topStatuses : (["watching", "planned", "completed"] as const);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/25">
      <div className="border-b border-border bg-gradient-to-br from-accent/20 via-accent/5 to-transparent px-6 pb-7 pt-8 sm:px-8 sm:pb-8">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
          <ProfileAvatar
            avatar={user.avatar}
            nickname={user.nickname}
            decorationId={user.avatarDecorationId}
            decorationScale={user.avatarDecorationScale}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-foreground">{user.nickname}</h1>
              {user.isAdmin ? (
                <span className="rounded-full border border-accent/50 bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  Админ
                </span>
              ) : null}
              {!onTrackAnime ? (
                <span className="rounded-full border border-border bg-background/80 px-2.5 py-0.5 text-xs font-semibold text-muted">
                  Shikimori
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              Shikimori ID {user.shikimoriId}
              {memberSince ? (
                <>
                  <span className="mx-2 text-border">·</span>
                  на Track Anime с {formatMemberSince(memberSince)}
                </>
              ) : (
                <span className="text-muted"> · профиль Shikimori</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6 sm:px-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Списки аниме
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {highlightStatuses.map((tab) => (
              <StatTile
                key={tab}
                label={LIST_STATUS_LABELS[tab] ?? tab}
                value={stats.listCounts[tab] ?? 0}
                href={favoritesTabHref(tab)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {isOwn ? "На сайте" : "Статистика"}
          </h2>
          <div className={`grid grid-cols-2 gap-3 ${isOwn ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <StatTile
              label="В списках"
              value={stats.totalListEntries}
              href={favoritesTabHref("all")}
            />
            <StatTile
              label="Закладки"
              value={stats.bookmarks}
              href={favoritesTabHref("bookmarks")}
            />
            {isOwn ? (
              <StatTile label="История" value={stats.watchHistory} href="/history" />
            ) : null}
            <StatTile
              label="Средняя оценка"
              value={stats.averageScore != null ? stats.averageScore : "—"}
              accent={stats.averageScore != null}
            />
          </div>
          {stats.ratedCount > 0 ? (
            <p className="mt-2 text-xs text-muted">Оценено {stats.ratedCount} тайтлов</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-3">
          {isOwn ? (
            <OwnSyncStatus stats={stats.listSync} />
          ) : (
            <PublicSyncStatus
              stats={stats.listSync}
              dataSource={dataSource}
              onTrackAnime={onTrackAnime}
            />
          )}
        </section>

        {isOwn ? <ProfileSiteSettingsNote /> : null}

        <ProfileFriendsSection
          nickname={user.nickname}
          shikimoriFriends={friends.friends}
          shikimoriError={friends.error}
          siteOutgoing={siteFriends.outgoing}
          siteIncoming={siteFriends.incoming}
          showIncomingTab={showIncomingFriendsTab}
        />

        <div className="flex flex-wrap items-center gap-3">
          {!isOwn ? (
            <ProfileFriendButton
              targetShikimoriId={user.shikimoriId}
              targetNickname={user.nickname}
              initialStatus={friendStatus}
              targetOnTrackAnime={onTrackAnime}
            />
          ) : null}
          <Link
            href={favoritesHref}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90"
          >
            {isOwn ? "Избранное" : "Списки и закладки"}
          </Link>
          {isOwn ? (
            <>
              <Link
                href="/history"
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim"
              >
                История просмотра
              </Link>
              {showPublicProfileLink ? (
                <Link
                  href={publicProfileHref}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim"
                >
                  Публичный профиль
                </Link>
              ) : null}
            </>
          ) : (
            <Link
              href={publicProfileHref}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim"
            >
              Профиль
            </Link>
          )}
          <a
            href={shikimoriSiteUrl(`/${user.nickname}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim"
          >
            Shikimori
          </a>
          {isOwn && user.isAdmin ? (
            <Link
              href="/admin"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-surface-dim"
            >
              Админ-панель
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
