import Link from "next/link";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { buildSearchHref, type SearchPage as SearchPageData } from "@/lib/search-shared";

type Props = {
  result: SearchPageData;
};

function PaginationLink({
  page,
  label,
  result,
  disabled,
}: {
  page: number;
  label: string;
  result: SearchPageData;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 py-2 text-sm text-muted/50">
        {label}
      </span>
    );
  }

  const href = buildSearchHref({
    q: result.genre ? undefined : result.query || undefined,
    genre: result.genre ?? undefined,
    page,
  });

  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:border-accent/40 hover:text-accent"
    >
      {label}
    </Link>
  );
}

export function SearchResultsView({ result }: Props) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const title = result.genre
    ? `Жанр: ${result.genre}`
    : result.query
      ? `Поиск: ${result.query}`
      : "Поиск аниме";

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {result.items.length > 0 ? (
          <p className="text-sm text-muted">
            Найдено: {result.total.toLocaleString("ru-RU")} · страница {result.page} из {totalPages}
          </p>
        ) : null}
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-muted">Ничего не найдено</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {result.items.map((item) => (
              <SearchResultCard key={item.shikimoriId} item={item} />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <PaginationLink page={result.page - 1} label="← Назад" result={result} disabled={result.page <= 1} />
              <span className="px-2 text-sm text-muted">
                {result.page} / {totalPages}
              </span>
              <PaginationLink
                page={result.page + 1}
                label="Дальше →"
                result={result}
                disabled={!result.hasMore && result.page >= totalPages}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
