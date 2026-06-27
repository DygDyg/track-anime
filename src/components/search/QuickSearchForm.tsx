"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SearchGenreMultiSelect } from "@/components/search/SearchGenreMultiSelect";
import { siteClass } from "@/components/site/site-styles";
import { buildAdvancedSearchHref, parseGenreList, serializeGenreList } from "@/lib/search-fields";
import { SEARCH_MIN_QUERY_LENGTH, buildSearchHref } from "@/lib/search-shared";

type Props = {
  initialQuery?: string;
  initialGenre?: string;
};

export function QuickSearchForm({ initialQuery = "", initialGenre = "" }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [genre, setGenre] = useState(serializeGenreList(parseGenreList(initialGenre)));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    const serializedGenres = serializeGenreList(parseGenreList(genre));
    const hasQuery = trimmedQuery.length >= SEARCH_MIN_QUERY_LENGTH;
    const hasGenres = parseGenreList(genre).length > 0;

    if (!hasQuery && !hasGenres) return;

    router.push(
      buildSearchHref({
        q: hasQuery ? trimmedQuery : undefined,
        genre: hasGenres ? serializedGenres : undefined,
      }),
    );
  };

  const hasValues = Boolean(query.trim() || parseGenreList(genre).length > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className={siteClass.label}>Название</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Введите название аниме…"
          autoComplete="off"
          spellCheck={false}
          className={siteClass.input}
        />
      </label>

      <SearchGenreMultiSelect value={genre} onChange={setGenre} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={siteClass.btnSmOn}>
          Найти
        </button>
        {hasValues ? (
          <Link href="/search" className={siteClass.btnSmOff}>
            Сбросить
          </Link>
        ) : null}
        <Link href={buildAdvancedSearchHref({})} className={siteClass.btnSmOff}>
          Подробный поиск
        </Link>
      </div>
    </form>
  );
}
