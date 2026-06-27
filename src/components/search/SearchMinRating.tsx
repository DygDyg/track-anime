"use client";

import { useId } from "react";
import { siteClass } from "@/components/site/site-styles";
import { SEARCH_RATING_MAX, SEARCH_RATING_MIN } from "@/lib/search-fields";

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

function clampRating(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 10) / 10;
}

export function SearchMinRating({
  value,
  onChange,
  min = SEARCH_RATING_MIN,
  max = SEARCH_RATING_MAX,
  step = 0.1,
}: Props) {
  const inputId = useId();
  const safeValue = clampRating(value, min, max);
  const active = safeValue > min;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={siteClass.label}>Мин. рейтинг</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {active ? `★ ${safeValue.toFixed(1)}+` : "Любой"}
        </span>
      </div>

      <div className="site-year-range mt-3 rounded-lg border border-border bg-background p-4">
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted">
          Shikimori от {safeValue.toFixed(1)}
        </label>
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={(event) => onChange(clampRating(Number(event.target.value), min, max))}
          className="site-year-range-input"
        />
      </div>
    </div>
  );
}
