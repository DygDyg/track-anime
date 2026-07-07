"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";

type Props = {
  label?: string;
  children: ReactNode;
};

export function BbcodeSpoilerBlock({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const title = label?.trim() || "Спойлер";

  const toggle = () => setOpen((value) => !value);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <div className="bbcode-spoiler-block my-2 block w-full overflow-hidden rounded-md border border-border/70">
      <button
        type="button"
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        className="bbcode-spoiler-block__title flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground transition hover:text-accent"
      >
        <span>{title}</span>
        <span className="text-xs font-normal text-muted" aria-hidden>
          {open ? "Скрыть" : "Показать"}
        </span>
      </button>
      {open ? (
        <div className="bbcode-spoiler-block__content border-t border-border/70 px-3 py-2 text-sm leading-relaxed text-muted">
          {children}
        </div>
      ) : null}
    </div>
  );
}
