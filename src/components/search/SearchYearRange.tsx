"use client";

import { useCallback, useId } from "react";
import { siteClass } from "@/components/site/site-styles";
import { SEARCH_YEAR_MAX, SEARCH_YEAR_MIN } from "@/lib/search-fields";

type Props = {
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
  min?: number;
  max?: number;
};

function clampYear(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function SearchYearRange({
  from,
  to,
  onChange,
  min = SEARCH_YEAR_MIN,
  max = SEARCH_YEAR_MAX,
}: Props) {
  const fromId = useId();
  const toId = useId();
  const safeFrom = clampYear(from, min, max);
  const safeTo = clampYear(to, min, max);
  const displayFrom = Math.min(safeFrom, safeTo);
  const displayTo = Math.max(safeFrom, safeTo);
  const rangeActive = displayFrom > min || displayTo < max;

  const setFrom = useCallback(
    (nextFrom: number) => {
      const value = clampYear(nextFrom, min, max);
      onChange(Math.min(value, safeTo), safeTo);
    },
    [min, max, onChange, safeTo],
  );

  const setTo = useCallback(
    (nextTo: number) => {
      const value = clampYear(nextTo, min, max);
      onChange(safeFrom, Math.max(value, safeFrom));
    },
    [min, max, onChange, safeFrom],
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={siteClass.label}>Год выхода</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {displayFrom === displayTo ? displayFrom : `${displayFrom} — ${displayTo}`}
          {!rangeActive ? <span className="ml-2 font-normal text-muted">(любой)</span> : null}
        </span>
      </div>

      <div className="site-year-range mt-3 space-y-4 rounded-lg border border-border bg-background p-4">
        <div>
          <label htmlFor={fromId} className="mb-1 block text-xs font-medium text-muted">
            От {displayFrom}
          </label>
          <input
            id={fromId}
            type="range"
            min={min}
            max={max}
            step={1}
            value={displayFrom}
            onChange={(event) => setFrom(Number(event.target.value))}
            className="site-year-range-input"
          />
        </div>
        <div>
          <label htmlFor={toId} className="mb-1 block text-xs font-medium text-muted">
            До {displayTo}
          </label>
          <input
            id={toId}
            type="range"
            min={min}
            max={max}
            step={1}
            value={displayTo}
            onChange={(event) => setTo(Number(event.target.value))}
            className="site-year-range-input"
          />
        </div>
      </div>
    </div>
  );
}
