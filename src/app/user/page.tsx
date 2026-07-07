import type { Metadata } from "next";
import { NavLink } from "@/components/NavLink";
import { redirect } from "next/navigation";
import { UsersSearchForm } from "@/components/user/UsersSearchForm";
import { userProfilePath } from "@/lib/public-user";
import { buildSitePageMetadata } from "@/lib/site-metadata";
import {
  parseShikimoriUserQuery,
  searchShikimoriUsers,
  type ShikimoriUserBrief,
} from "@/lib/shikimori/users";

export const metadata: Metadata = buildSitePageMetadata({
  title: "Пользователи Shikimori",
  description: "Поиск пользователей Shikimori и просмотр их профилей на Track Anime",
  canonicalPath: "/user",
});

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

function UserResultCard({ user }: { user: ShikimoriUserBrief }) {
  return (
    <NavLink
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
    </NavLink>
  );
}

export default async function UsersPage({ searchParams }: Props) {
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
          Пользователи Shikimori
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Найдите пользователя по нику или Shikimori ID — откроется его профиль и списки аниме.
        </p>
      </div>

      <UsersSearchForm defaultQuery={query} />

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
