"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  canAddProfileFriend,
  canRemoveProfileFriend,
  normalizeProfileFriendStatus,
  profileFriendStatusLabel,
  type ProfileFriendStatus,
} from "@/lib/profile-friend-status";
import { AsyncButton } from "@/components/ui/AsyncButton";

export function ProfileFriendButton({
  targetShikimoriId,
  targetNickname,
  initialStatus,
  targetOnTrackAnime = true,
}: {
  targetShikimoriId: number;
  targetNickname: string;
  initialStatus: ProfileFriendStatus | null;
  targetOnTrackAnime?: boolean;
}) {
  const { user, login, authNavigating } = useAuth();
  const [status, setStatus] = useState<ProfileFriendStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (method: "POST" | "DELETE") => {
      setPending(true);
      setError(null);

      try {
        const res = await fetch(`/api/user/friends/${targetShikimoriId}`, { method });
        const data = (await res.json().catch(() => ({}))) as {
          status?: ProfileFriendStatus;
          error?: string;
        };

        if (!res.ok) {
          if (res.status === 401) {
            login();
            return;
          }
          throw new Error(data.error ?? "Не удалось обновить друзей");
        }

        if (data.status) {
          setStatus(data.status);
        } else {
          setStatus(normalizeProfileFriendStatus(null));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сети");
      } finally {
        setPending(false);
      }
    },
    [login, targetShikimoriId],
  );

  if (!user) {
    return (
      <AsyncButton
        type="button"
        onClick={login}
        loading={authNavigating}
        loadingLabel="Вход…"
        className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/15"
      >
        Войти, чтобы добавить в друзья
      </AsyncButton>
    );
  }

  if (user.shikimoriId === targetShikimoriId) {
    return null;
  }

  if (!targetOnTrackAnime) {
    return (
      <p className="text-xs text-muted">
        Пользователь не зарегистрирован на Track Anime — добавить в друзья на сайте нельзя.
      </p>
    );
  }

  const resolvedStatus = status ?? "none";

  if (canRemoveProfileFriend(resolvedStatus)) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => void mutate("DELETE")}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Удаление…" : "Удалить из друзей на Track Anime"}
        </button>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }

  if (canAddProfileFriend(resolvedStatus)) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => void mutate("POST")}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Добавление…" : profileFriendStatusLabel(resolvedStatus)}
        </button>
        <p className="text-xs text-muted">
          Только на Track Anime · {targetNickname}
        </p>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }

  return null;
}
