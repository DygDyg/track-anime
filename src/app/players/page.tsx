import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { userProfilePath } from "@/lib/public-user";
import {
  parseShikimoriUserQuery,
  searchShikimoriUsers,
  type ShikimoriUserBrief,
} from "@/lib/shikimori/users";

export const metadata: Metadata = {
  title: "Игроки Shikimori",
  description: "Поиск пользователей Shikimori и просмотр их списков на Track Anime",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

function UserResultCard({ user }: { user: ShikimoriUserBrief }) {
  return (
    <Link
      href={userProfilePath(user.id)}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-surface-dim/80"
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl border border-border object-cover"
        />
      ) : (
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-accent/15 text-sm font-bold text-accent">
          {user.nickname.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground group-hover:text-accent">{user.nickname}</p>
        <p className="text-xs text-muted">Shikimori ID {user.id}</p>
      </div>
    </Link>
  );
}

export default async function PlayersPage({ searchParams }: Props) {
  const { q: rawQuery } = await searchParams;
  const query = rawQuery?.trim() ?? "";

  const numericId = query ? parseShikimoriUserQuery(query) : null;
  if (numericId) {
    redirect(userProfilePath(numericId));
  }

  const results = query.length >= 2 ? await searchShikimoriUsers(query) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Игроки Shikimori
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Найдите пользователя по нику или Shikimori ID — откроются его профиль и списки аниме.
        </p>
      </div>

      <form action="/players" method="get" className="mb-8">
        <label htmlFor="players-search" className="sr-only">
          Поиск игрока
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="players-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Ник или Shikimori ID…"
            className="h-11 flex-1 rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            autoComplete="off"
            spellCheck={false}
            minLength={1}
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent/90"
          >
            Найти
          </button>
        </div>
      </form>

      {query.length > 0 && query.length < 2 ? (
        <p className="text-sm text-muted">Введите минимум 2 символа для поиска по нику.</p>
      ) : null}

      {query.length >= 2 ? (
        results.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((user) => (
              <UserResultCard key={user.id} user={user} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted">
              По запросу «{query}» никого не найдено на Shikimori.
            </p>
          </div>
        )
      ) : (
        <p className="text-sm text-muted">
          Можно ввести точный Shikimori ID (число) — откроется профиль сразу.
        </p>
      )}
    </div>
  );
}
