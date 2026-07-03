"use client";

import { useState } from "react";
import { AsyncButton } from "@/components/ui/AsyncButton";

export function UsersSearchForm({ defaultQuery = "" }: { defaultQuery?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action="/user"
      method="get"
      className="mb-8"
      onSubmit={() => setPending(true)}
    >
      <label htmlFor="users-search" className="sr-only">
        Поиск пользователя
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="users-search"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          placeholder="Ник или Shikimori ID…"
          className="h-11 flex-1 rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
          autoComplete="off"
          spellCheck={false}
          minLength={1}
          disabled={pending}
        />
        <AsyncButton
          type="submit"
          loading={pending}
          loadingLabel="Поиск…"
          className="h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-90"
        >
          Найти
        </AsyncButton>
      </div>
    </form>
  );
}
