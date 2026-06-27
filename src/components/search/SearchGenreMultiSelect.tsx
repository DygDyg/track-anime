"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { siteClass } from "@/components/site/site-styles";
import { SEARCH_GENRE_PLACEHOLDER, parseGenreList, serializeGenreList } from "@/lib/search-fields";

const GENRE_FETCH_LIMIT = 500;

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

type SuggestResponse = {
  items: string[];
};

function genreKey(genre: string): string {
  return genre.toLowerCase();
}

function isGenreSelected(selectedGenres: string[], genre: string): boolean {
  return selectedGenres.some((item) => genreKey(item) === genreKey(genre));
}

export function SearchGenreMultiSelect({ value, onChange, label = "Жанр" }: Props) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedGenres = parseGenreList(value);

  const commitGenres = useCallback(
    (genres: string[]) => {
      onChange(serializeGenreList(genres));
    },
    [onChange],
  );

  const addGenre = useCallback(
    (genre: string) => {
      const trimmed = genre.trim();
      if (!trimmed || isGenreSelected(selectedGenres, trimmed)) return;

      commitGenres([...selectedGenres, trimmed]);
      setQuery("");
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [commitGenres, selectedGenres],
  );

  const removeGenre = useCallback(
    (genre: string) => {
      commitGenres(selectedGenres.filter((item) => genreKey(item) !== genreKey(genre)));
    },
    [commitGenres, selectedGenres],
  );

  const loadAllGenres = useCallback(async () => {
    if (loaded || loading) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        field: "genre",
        q: "",
        limit: String(GENRE_FETCH_LIMIT),
      });
      const response = await fetch(`/api/search/suggest?${params.toString()}`);
      if (!response.ok) return;

      const data = (await response.json()) as SuggestResponse;
      setAllGenres(data.items);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const visibleItems = useMemo(() => {
    const selectedLower = new Set(selectedGenres.map((item) => genreKey(item)));
    const trimmed = query.trim().toLowerCase();

    return allGenres.filter((genre) => {
      if (selectedLower.has(genreKey(genre))) return false;
      if (!trimmed) return true;
      return genre.toLowerCase().includes(trimmed);
    });
  }, [allGenres, query, selectedGenres]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (activeIndex >= visibleItems.length) {
      setActiveIndex(visibleItems.length > 0 ? 0 : -1);
    }
  }, [activeIndex, visibleItems.length]);

  const handleFocus = () => {
    setOpen(true);
    void loadAllGenres();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !query && selectedGenres.length > 0) {
      removeGenre(selectedGenres[selectedGenres.length - 1]!);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (open && activeIndex >= 0 && visibleItems[activeIndex]) {
        addGenre(visibleItems[activeIndex]!);
        return;
      }
      if (query.trim()) addGenre(query);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (visibleItems.length === 0 ? -1 : (index + 1) % visibleItems.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        visibleItems.length === 0 ? -1 : index <= 0 ? visibleItems.length - 1 : index - 1,
      );
    }
  };

  const trimmedQuery = query.trim();
  const showDropdown = open && (loading || visibleItems.length > 0 || (loaded && Boolean(trimmedQuery)));

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={`${listboxId}-input`} className={siteClass.label}>
        {label}
      </label>

      <div
        className="site-genre-multi"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedGenres.map((genre) => (
          <span key={genre} className="site-genre-tag">
            <span className="site-genre-tag-label">{genre}</span>
            <button
              type="button"
              className="site-genre-tag-remove"
              aria-label={`Убрать жанр ${genre}`}
              onClick={(event) => {
                event.stopPropagation();
                removeGenre(genre);
              }}
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={selectedGenres.length > 0 ? "" : SEARCH_GENRE_PLACEHOLDER}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={`${listboxId}-listbox`}
          aria-autocomplete="list"
          className="site-genre-multi-input"
        />

        {loading ? (
          <span aria-hidden className="site-genre-multi-spinner">
            <span className="site-search-spinner inline-block h-3.5 w-3.5 rounded-full border-2 border-accent border-r-transparent" />
          </span>
        ) : null}
      </div>

      {showDropdown ? (
        <ul
          id={`${listboxId}-listbox`}
          role="listbox"
          className={`site-genre-suggest ${siteClass.dropdown}`}
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-muted">Загрузка…</li>
          ) : visibleItems.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Ничего не найдено</li>
          ) : (
            visibleItems.map((item, index) => (
              <li key={item} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addGenre(item)}
                  className={
                    index === activeIndex ? siteClass.dropdownOptionActive : siteClass.dropdownOption
                  }
                >
                  {item}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
