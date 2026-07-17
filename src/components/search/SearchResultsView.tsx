import Link from "next/link";
import { AdvancedSearchForm } from "@/components/search/AdvancedSearchForm";
import { QuickSearchForm } from "@/components/search/QuickSearchForm";
import { SearchResultsInfiniteGrid } from "@/components/search/SearchResultsInfiniteGrid";
import { siteClass } from "@/components/site/site-styles";
import { homeFeedGutterX } from "@/lib/home-feed-layout";
import {
  advancedFiltersSummary,
  hasAdvancedFilters,
  parseGenreList,
} from "@/lib/search-fields";
import { type SearchPage as SearchPageData } from "@/lib/search-shared";

type Props = {
  result: SearchPageData;
};

function SearchTabs({ activeTab }: { activeTab: "quick" | "advanced" }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Режим поиска">
      <Link
        href="/search"
        role="tab"
        aria-selected={activeTab === "quick"}
        className={activeTab === "quick" ? siteClass.btnSmOn : siteClass.btnSmOff}
      >
        Быстрый
      </Link>
      <Link
        href="/search?tab=advanced"
        role="tab"
        aria-selected={activeTab === "advanced"}
        className={activeTab === "advanced" ? siteClass.btnSmOn : siteClass.btnSmOff}
      >
        По полям
      </Link>
    </div>
  );
}

function resultTitle(result: SearchPageData): string {
  if (result.tab === "advanced") {
    if (result.advancedFilters && hasAdvancedFilters(result.advancedFilters)) {
      return `Поиск: ${advancedFiltersSummary(result.advancedFilters)}`;
    }
    return "Поиск по полям";
  }

  if (result.genre) {
    const genres = parseGenreList(result.genre);
    if (genres.length > 0) return `Жанры: ${genres.join(", ")}`;
  }
  if (result.query) return `Поиск: ${result.query}`;
  return "Поиск аниме";
}

export function SearchResultsView({ result }: Props) {
  const tab = result.tab ?? "quick";
  const title = resultTitle(result);
  const hasSearchCriteria =
    tab === "advanced"
      ? Boolean(result.advancedFilters && hasAdvancedFilters(result.advancedFilters))
      : Boolean(result.query || parseGenreList(result.genre).length > 0);

  return (
    <div className={`${homeFeedGutterX} py-6 sm:py-10`}>
      <div className="mb-6 space-y-2">
        <p className={siteClass.pageEyebrow}>Track Anime</p>
        <h1 className={siteClass.pageTitle}>{title}</h1>
      </div>

      <SearchTabs activeTab={tab} />

      <section role="tabpanel" className={`${siteClass.panel} mb-6 overflow-visible`}>
        <h2 className={siteClass.sectionTitle}>{tab === "advanced" ? "Фильтры" : "Запрос"}</h2>
        {tab === "advanced" ? (
          <AdvancedSearchForm initialFilters={result.advancedFilters} />
        ) : (
          <QuickSearchForm initialQuery={result.query} initialGenre={result.genre ?? ""} />
        )}
      </section>

      {!hasSearchCriteria ? (
        <section className={siteClass.empty}>
          <p>
            {tab === "advanced"
              ? "Заполните одно или несколько полей и нажмите «Найти»"
              : "Введите название или жанр и нажмите «Найти»"}
          </p>
        </section>
      ) : result.items.length === 0 ? (
        <section className={siteClass.empty}>
          <p>Ничего не найдено</p>
        </section>
      ) : (
        <section className={`${siteClass.panel} space-y-6`}>
          <h2 className={siteClass.sectionTitle}>Результаты</h2>
          {result.layoutCorrectedQuery ? (
            <p className="text-sm text-foreground/80">
              По запросу «{result.query}» ничего не найдено. Показаны результаты для «
              {result.layoutCorrectedQuery}» (исправлена раскладка клавиатуры).
            </p>
          ) : null}
          <SearchResultsInfiniteGrid
            initialItems={result.items}
            initialPage={result.page}
            initialHasMore={result.hasMore}
            initialTotal={result.total}
            tab={tab}
            query={result.query}
            genre={result.genre}
            advancedFilters={result.advancedFilters}
            pageSize={result.pageSize}
          />
        </section>
      )}
    </div>
  );
}
