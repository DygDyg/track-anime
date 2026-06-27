import Link from "next/link";
import { RelativeTime } from "@/components/RelativeTime";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import { userProfilePath } from "@/lib/public-user";
import type { ProfileFriendsData } from "@/lib/user-friends";

function FriendCard({
  friend,
}: {
  friend: ProfileFriendsData["friends"][number];
}) {
  return (
    <Link
      href={userProfilePath(friend.shikimoriId)}
      className="group flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3 transition hover:border-accent/40 hover:bg-surface-dim/80"
    >
      {friend.avatar ? (
        <img
          src={friend.avatar}
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl border border-border object-cover"
        />
      ) : (
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-accent/15 text-sm font-bold text-accent">
          {friend.nickname.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
          {friend.nickname}
        </p>
        {friend.lastOnlineAt ? (
          <p className="truncate text-xs text-muted">
            был в сети{" "}
            <RelativeTime date={friend.lastOnlineAt} className="text-foreground/70" />
          </p>
        ) : friend.onSite ? (
          <p className="text-xs text-accent/90">на Track Anime</p>
        ) : (
          <p className="text-xs text-muted">профиль Shikimori</p>
        )}
      </div>
    </Link>
  );
}

export function ProfileFriendsSection({
  nickname,
  friends,
  error,
}: ProfileFriendsData & {
  nickname: string;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Друзья Shikimori
        </h2>
        {friends.length > 0 ? (
          <span className="text-xs tabular-nums text-muted">{friends.length}</span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-muted">
          {error}
        </p>
      ) : friends.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-3 text-sm text-muted">
          У {nickname} пока нет друзей в Shikimori.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {friends.map((friend) => (
              <FriendCard key={friend.shikimoriId} friend={friend} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            <a
              href={shikimoriSiteUrl(`/${nickname}/friends`)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              Все друзья на Shikimori
            </a>
            {friends.length >= 24 ? " · показаны первые 24" : null}
          </p>
        </>
      )}
    </section>
  );
}
