"use client";

import { useEffect, useId, useRef, useState } from "react";
import { siteClass } from "@/components/site/site-styles";

type Option = {
  value: string;
  label: string;
  badgeClass: string | null;
  description?: string | null;
};

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

function OptionBadge({ label, badgeClass }: { label: string; badgeClass: string | null }) {
  if (!badgeClass) {
    return <span className="text-sm text-muted">{label}</span>;
  }

  return <span className={badgeClass}>{label}</span>;
}

export function SearchColoredSelect({ label, value, options, onChange }: Props) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? options[0]!;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <span className={siteClass.label}>{label}</span>
      <button
        type="button"
        id={`${listboxId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${listboxId}-listbox`}
        onClick={() => setOpen((current) => !current)}
        className={[
          siteClass.input,
          "flex items-center justify-between gap-2 text-left",
          selected.badgeClass ? "border-accent/40 bg-surface-dim" : "",
        ].join(" ")}
      >
        <span className="min-w-0 truncate">
          <OptionBadge label={selected.label} badgeClass={selected.badgeClass} />
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className={["h-4 w-4 shrink-0 text-muted transition", open ? "rotate-180" : ""].join(" ")}
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {selected.description ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{selected.description}</p>
      ) : null}

      {open ? (
        <ul
          id={`${listboxId}-listbox`}
          role="listbox"
          aria-labelledby={`${listboxId}-trigger`}
          className={`absolute z-30 mt-1 max-h-60 w-full overflow-y-auto py-1 ${siteClass.dropdown}`}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value || "__any"} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "!flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition",
                    active ? siteClass.dropdownOptionActive : siteClass.dropdownOption,
                  ].join(" ")}
                >
                  <OptionBadge label={option.label} badgeClass={option.badgeClass} />
                  {option.description ? (
                    <span className="text-xs leading-relaxed text-muted">{option.description}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
