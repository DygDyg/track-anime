"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { SearchFieldId } from "@/lib/search-fields";
import { siteClass } from "@/components/site/site-styles";

type Props = {
  fieldId: SearchFieldId;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "numeric";
};

type SuggestResponse = {
  items: string[];
};

const SUGGEST_DEBOUNCE_MS = 220;

export function SearchFieldCombobox({
  fieldId,
  label,
  placeholder,
  value,
  onChange,
  inputMode = "text",
}: Props) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 1) {
        setItems([]);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      const params = new URLSearchParams({
        field: fieldId,
        q: trimmed,
      });

      try {
        const response = await fetch(`/api/search/suggest?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok || requestId !== requestIdRef.current) return;

        const data = (await response.json()) as SuggestResponse;
        if (requestId !== requestIdRef.current) return;

        setItems(data.items);
        setActiveIndex(data.items.length > 0 ? 0 : -1);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;
        setItems([]);
        setActiveIndex(-1);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [fieldId],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(value);
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [fetchSuggestions, value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectItem = useCallback(
    (item: string) => {
      onChange(item);
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (items.length === 0 ? -1 : (index + 1) % items.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        items.length === 0 ? -1 : index <= 0 ? items.length - 1 : index - 1,
      );
      return;
    }

    if (event.key === "Enter" && open && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      selectItem(items[activeIndex]!);
    }
  };

  const showPanel = open && value.trim().length >= 1;
  const showEmpty = showPanel && !loading && items.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={`${listboxId}-input`} className={siteClass.label}>
        {label}
      </label>
      <div className="relative">
        <input
          id={`${listboxId}-input`}
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={`${listboxId}-listbox`}
          aria-autocomplete="list"
          className={siteClass.input}
        />
        {loading ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center"
          >
            <span className="site-search-spinner inline-block h-3.5 w-3.5 rounded-full border-2 border-accent border-r-transparent" />
          </span>
        ) : null}
      </div>

      {showPanel ? (
        <ul
          id={`${listboxId}-listbox`}
          role="listbox"
          className={`absolute z-20 mt-1 max-h-56 w-full overflow-y-auto py-1 ${siteClass.dropdown}`}
        >
          {showEmpty ? (
            <li className="px-3 py-2 text-sm text-muted">Нет подсказок</li>
          ) : (
            items.map((item, index) => (
              <li key={item} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
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
