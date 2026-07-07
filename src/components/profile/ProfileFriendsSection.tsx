"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { RelativeTime } from "@/components/RelativeTime";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ShikimoriBadge } from "@/components/profile/ShikimoriBadge";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import { mergeProfileFriends, type MergedProfileFriend } from "@/lib/merge-profile-friends";
import { userProfilePath } from "@/lib/public-user";
import type { ProfileFriendsData } from "@/lib/user-friends";
import type { SiteFriendListItem } from "@/lib/site-friends";
import { AvatarWithDecoration } from "@/components/profile/AvatarWithDecoration";

type FriendsTab = "friends" | "added-me";

function FriendCard({
  friend,
  subtitle,
  badges,
  action,
  notice,
}: {
  friend: {
    shikimoriId: number;
    nickname: string;
    avatar: string | null;
    avatarDecorationId?: string | null;
    avatarDecorationScale?: number;
  };
  subtitle?: ReactNode;
  badges?: ReactNode;
  action?: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center gap-3">
        <Link
          href={userProfilePath(friend.shikimoriId)}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <AvatarWithDecoration
            avatar={friend.avatar}
            nickname={friend.nickname}
            decorationId={friend.avatarDecorationId}
            decorationScale={friend.avatarDecorationScale}
            size="friend"
          />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
                {friend.nickname}
              </p>
              {badges}
            </div>
            {subtitle ? <div className="truncate text-xs text-muted">{subtitle}</div> : null}
          </div>
        </Link>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {notice ? <div className="mt-2">{notice}</div> : null}
    </div>
  );
}

function mergedFriendSubtitle(friend: MergedProfileFriend): ReactNode {
  if (friend.fromShikimori && friend.lastOnlineAt) {
    return (
      <>
        был в сети{" "}
        <RelativeTime date={friend.lastOnlineAt} className="text-foreground/70" />
      </>
    );
  }

  if (friend.fromTrackAnime && friend.siteAddedAt) {
    return (
      <>
        на Track Anime · добавлен{" "}
        <RelativeTime date={friend.siteAddedAt} className="text-foreground/70" />
      </>
    );
  }

  if (friend.fromShikimori && friend.onSite) {
    return "Shikimori · на Track Anime";
  }

  if (friend.fromShikimori) {
    return "только на Shikimori";
  }

  return "только на Track Anime";
}

function ShikimoriRemoveNotice({
  nickname,
  shikimoriOnly,
}: {
  nickname: string;
  shikimoriOnly: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
      <p>
        {shikimoriOnly
          ? "Этого друга можно убрать только на Shikimori — на Track Anime мы не управляем списком Shikimori."
          : "Друг убран с Track Anime, но остаётся в друзьях на Shikimori. Чтобы удалить и там, откройте профиль на Shikimori."}
      </p>
      <a
        href={shikimoriSiteUrl(`/${nickname}`)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block font-semibold text-accent hover:underline"
      >
        Профиль {nickname} на Shikimori
      </a>
    </div>
  );
}

function MergedFriendCard({
  friend,
  canManage,
  onRemoved,
}: {
  friend: MergedProfileFriend;
  canManage: boolean;
  onRemoved: (shikimoriId: number) => void;
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<"shikimori-only" | "shikimori-remains" | null>(null);
  const [hidden, setHidden] = useState(false);

  const remove = useCallback(async () => {
    if (friend.fromShikimori && !friend.fromTrackAnime) {
      setNotice("shikimori-only");
      return;
    }

    if (!friend.fromTrackAnime) return;

    setPending(true);
    setNotice(null);

    try {
      const res = await fetch(`/api/user/friends/${friend.shikimoriId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось убрать");

      if (friend.fromShikimori) {
        setNotice("shikimori-remains");
        onRemoved(friend.shikimoriId);
        setPending(false);
        return;
      }

      setHidden(true);
      onRemoved(friend.shikimoriId);
    } catch {
      setPending(false);
    }
  }, [friend.fromShikimori, friend.fromTrackAnime, friend.shikimoriId, onRemoved]);

  if (hidden) return null;

  return (
    <FriendCard
      friend={friend}
      badges={friend.fromShikimori ? <ShikimoriBadge /> : null}
      subtitle={mergedFriendSubtitle(friend)}
      action={
        canManage ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void remove()}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-60"
          >
            {pending ? <LoadingSpinner size="xs" /> : "Убрать"}
          </button>
        ) : null
      }
      notice={
        notice ? (
          <ShikimoriRemoveNotice nickname={friend.nickname} shikimoriOnly={notice === "shikimori-only"} />
        ) : null
      }
    />
  );
}

function SiteIncomingFriendCard({
  friend,
}: {
  friend: SiteFriendListItem;
}) {
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);

  const remove = useCallback(async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/user/friends/incoming/${friend.shikimoriId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось убрать");
      setRemoved(true);
    } catch {
      setPending(false);
    }
  }, [friend.shikimoriId]);

  if (removed) return null;

  return (
    <FriendCard
      friend={friend}
      subtitle={
        <>
          добавил вас ·{" "}
          <RelativeTime date={friend.addedAt} className="text-foreground/70" />
        </>
      }
      action={
        <button
          type="button"
          disabled={pending}
          onClick={() => void remove()}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-60"
        >
          {pending ? "…" : "Убрать"}
        </button>
      }
    />
  );
}

export function ProfileFriendsSection({
  nickname,
  shikimoriFriends,
  shikimoriError,
  siteOutgoing,
  siteIncoming,
  showIncomingTab,
}: {
  nickname: string;
  shikimoriFriends: ProfileFriendsData["friends"];
  shikimoriError: string | null;
  siteOutgoing: SiteFriendListItem[];
  siteIncoming: SiteFriendListItem[];
  showIncomingTab: boolean;
}) {
  const [tab, setTab] = useState<FriendsTab>("friends");
  const [hiddenLocalIds, setHiddenLocalIds] = useState<Set<number>>(() => new Set());

  const mergedFriends = useMemo(
    () => mergeProfileFriends(shikimoriFriends, siteOutgoing),
    [shikimoriFriends, siteOutgoing],
  );

  const visibleFriends = useMemo(
    () => mergedFriends.filter((friend) => !hiddenLocalIds.has(friend.shikimoriId) || friend.fromShikimori),
    [mergedFriends, hiddenLocalIds],
  );

  const handleRemoved = useCallback((shikimoriId: number) => {
    setHiddenLocalIds((prev) => new Set(prev).add(shikimoriId));
  }, []);

  const canManage = showIncomingTab;

  const tabs: Array<{ id: FriendsTab; label: string; count?: number }> = [
    { id: "friends", label: "Друзья", count: visibleFriends.length },
  ];

  if (showIncomingTab) {
    tabs.push({
      id: "added-me",
      label: "Меня добавили в друзья",
      count: siteIncoming.length,
    });
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Друзья</h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Разделы друзей">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-medium transition",
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border bg-background/60 text-muted hover:border-accent/30 hover:text-foreground",
              ].join(" ")}
            >
              {item.label}
              {item.count != null && item.count > 0 ? (
                <span className="ml-1.5 tabular-nums opacity-80">{item.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "friends" ? (
        <div role="tabpanel" className="space-y-3">
          {shikimoriError ? (
            <p className="rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-muted">
              {shikimoriError}
            </p>
          ) : null}

          {visibleFriends.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-3 text-sm text-muted">
              {canManage
                ? "Вы ещё никого не добавили в друзья."
                : `У ${nickname} пока нет друзей.`}
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleFriends.map((friend) => (
                  <MergedFriendCard
                    key={friend.shikimoriId}
                    friend={friend}
                    canManage={canManage}
                    onRemoved={handleRemoved}
                  />
                ))}
              </div>
              {shikimoriFriends.length > 0 ? (
                <p className="text-xs text-muted">
                  <a
                    href={shikimoriSiteUrl(`/${nickname}/friends`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                  >
                    <ShikimoriBadge className="h-3.5 w-3.5" />
                    Все друзья на Shikimori
                  </a>
                  {shikimoriFriends.length >= 24 ? " · с Shikimori показаны первые 24" : null}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div role="tabpanel">
          {siteIncoming.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-3 text-sm text-muted">
              Вас пока никто не добавил в друзья на Track Anime.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {siteIncoming.map((friend) => (
                <SiteIncomingFriendCard key={friend.shikimoriId} friend={friend} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
