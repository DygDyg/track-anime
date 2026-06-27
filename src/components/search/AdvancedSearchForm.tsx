"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { SearchColoredSelect } from "@/components/search/SearchColoredSelect";
import { SearchFieldCombobox } from "@/components/search/SearchFieldCombobox";
import { SearchGenreMultiSelect } from "@/components/search/SearchGenreMultiSelect";
import { SearchMinRating } from "@/components/search/SearchMinRating";
import { SearchYearRange } from "@/components/search/SearchYearRange";
import { siteClass } from "@/components/site/site-styles";
import {
  SEARCH_COMBOBOX_FIELD_OPTIONS,
  SEARCH_KIND_OPTIONS,
  SEARCH_RATING_MIN,
  SEARCH_STATUS_OPTIONS,
  SEARCH_YEAR_MAX,
  SEARCH_YEAR_MIN,
  buildAdvancedSearchHref,
  emptyAdvancedFilters,
  isMinRatingActive,
  isYearRangeActive,
  parseGenreList,
  serializeGenreList,
  type AdvancedSearchFilters,
  type SearchFieldId,
} from "@/lib/search-fields";

type Props = {
  initialFilters?: AdvancedSearchFilters;
};

type ComboboxFieldId = Exclude<SearchFieldId, "genre" | "kind" | "status">;

function initFilters(initial?: AdvancedSearchFilters): AdvancedSearchFilters {
  return {
    ...emptyAdvancedFilters(),
    kind: "",
    status: "",
    yearFrom: String(SEARCH_YEAR_MIN),
    yearTo: String(SEARCH_YEAR_MAX),
    minRating: String(SEARCH_RATING_MIN),
    ...initial,
    genre: serializeGenreList(parseGenreList(initial?.genre)),
  };
}

function filtersForSubmit(filters: AdvancedSearchFilters): AdvancedSearchFilters {
  const next: AdvancedSearchFilters = { ...filters };

  if (!next.kind?.trim()) delete next.kind;
  if (!next.status?.trim()) delete next.status;

  if (!isYearRangeActive(next)) {
    delete next.yearFrom;
    delete next.yearTo;
  }

  if (!isMinRatingActive(next)) {
    delete next.minRating;
  }

  for (const option of SEARCH_COMBOBOX_FIELD_OPTIONS) {
    if (!next[option.id]?.trim()) delete next[option.id];
  }

  const genres = serializeGenreList(parseGenreList(next.genre));
  if (genres) next.genre = genres;
  else delete next.genre;

  return next;
}

function comboboxOption(id: ComboboxFieldId) {
  return SEARCH_COMBOBOX_FIELD_OPTIONS.find((option) => option.id === id)!;
}

function SearchComboboxFilter({
  id,
  filters,
  onChange,
  className = "",
}: {
  id: ComboboxFieldId;
  filters: AdvancedSearchFilters;
  onChange: (id: keyof AdvancedSearchFilters, value: string) => void;
  className?: string;
}) {
  const option = comboboxOption(id);

  return (
    <div className={className}>
      <SearchFieldCombobox
        fieldId={option.id}
        label={option.label}
        placeholder={option.placeholder}
        value={filters[option.id] ?? ""}
        onChange={(value) => onChange(option.id, value)}
        inputMode={option.inputMode}
      />
    </div>
  );
}

export function AdvancedSearchForm({ initialFilters }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<AdvancedSearchFilters>(() => initFilters(initialFilters));

  const yearFrom = useMemo(
    () => Number(filters.yearFrom) || SEARCH_YEAR_MIN,
    [filters.yearFrom],
  );
  const yearTo = useMemo(() => Number(filters.yearTo) || SEARCH_YEAR_MAX, [filters.yearTo]);
  const minRating = useMemo(
    () => Number(filters.minRating) || SEARCH_RATING_MIN,
    [filters.minRating],
  );

  const setField = (id: keyof AdvancedSearchFilters, value: string) => {
    setFilters((current) => ({ ...current, [id]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildAdvancedSearchHref(filtersForSubmit(filters)));
  };

  const handleReset = () => {
    setFilters(initFilters());
    router.push("/search?tab=advanced");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 overflow-visible">
      <div className="grid grid-cols-1 gap-4 overflow-visible sm:grid-cols-2 lg:grid-cols-6">
        <SearchComboboxFilter
          id="title"
          filters={filters}
          onChange={setField}
          className="sm:col-span-1 lg:col-span-2"
        />
        <SearchComboboxFilter
          id="animeTitle"
          filters={filters}
          onChange={setField}
          className="sm:col-span-1 lg:col-span-2"
        />
        <SearchComboboxFilter
          id="studio"
          filters={filters}
          onChange={setField}
          className="sm:col-span-2 lg:col-span-2"
        />

        <div className="sm:col-span-1 lg:col-span-3">
          <SearchColoredSelect
            label="Тип"
            value={filters.kind ?? ""}
            options={SEARCH_KIND_OPTIONS}
            onChange={(value) => setField("kind", value)}
          />
        </div>

        <div className="sm:col-span-1 lg:col-span-3">
          <SearchColoredSelect
            label="Статус"
            value={filters.status ?? ""}
            options={SEARCH_STATUS_OPTIONS}
            onChange={(value) => setField("status", value)}
          />
        </div>

        <div className="overflow-visible sm:col-span-2 lg:col-span-2">
          <SearchGenreMultiSelect value={filters.genre ?? ""} onChange={(value) => setField("genre", value)} />
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <SearchYearRange
            from={yearFrom}
            to={yearTo}
            onChange={(from, to) => {
              setFilters((current) => ({
                ...current,
                yearFrom: String(from),
                yearTo: String(to),
              }));
            }}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <SearchMinRating
            value={minRating}
            onChange={(value) => setField("minRating", String(value))}
          />
        </div>

        <SearchComboboxFilter
          id="description"
          filters={filters}
          onChange={setField}
          className="sm:col-span-2 lg:col-span-6"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={siteClass.btnSmOn}>
          Найти
        </button>
        <button type="button" onClick={handleReset} className={siteClass.btnSmOff}>
          Сбросить
        </button>
      </div>
    </form>
  );
}
