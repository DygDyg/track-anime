"use client";

import { useEffect, useId, useRef, useState } from "react";

export type EpisodeSeasonOption = {
  value: number;
  label: string;
};

type Props = {
  seasons: EpisodeSeasonOption[];
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function shortSeasonLabel(season: EpisodeSeasonOption): string {
  if (season.value === 0) return "С";
  return String(season.value);
}

export function EpisodeSeasonPicker({ seasons, value, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = seasons.find((season) => season.value === value) ?? seasons[0];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  if (!current || seasons.length === 0) return null;

  return (
    <div ref={rootRef} className="kodik-player-beta-season-picker relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={`Сезон: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
        className={[
          "inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-0.5 rounded-md border px-1.5 text-xs font-semibold tabular-nums transition",
          open
            ? "border-accent bg-accent/20 text-white"
            : "border-white/15 bg-white/5 text-white/85 hover:border-accent/50 hover:bg-white/10",
          "disabled:cursor-not-allowed disabled:opacity-40",
        ].join(" ")}
      >
        <span>{shortSeasonLabel(current)}</span>
        <svg
          viewBox="0 0 12 12"
          className={["h-2.5 w-2.5 opacity-70 transition", open ? "rotate-180" : ""].join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden
        >
          <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Сезон"
          className="absolute left-0 top-full z-50 mt-1.5 min-w-[8.5rem] rounded-lg border border-white/15 bg-black/90 p-1.5 shadow-xl backdrop-blur-md"
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
            Сезон
          </p>
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {seasons.map((season) => {
              const active = season.value === value;
              return (
                <li key={season.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(season.value);
                      setOpen(false);
                    }}
                    className={[
                      "w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition",
                      active
                        ? "bg-accent text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    {season.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
