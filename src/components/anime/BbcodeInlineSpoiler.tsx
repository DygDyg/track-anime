"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";

type Props = {
  label?: string;
  children: ReactNode;
};

export function BbcodeInlineSpoiler({ label, children }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((value) => !value);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label?.trim() || "Спойлер"}
      aria-pressed={open}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={["bbcode-spoiler", open ? "bbcode-spoiler--open" : "bbcode-spoiler--closed"].join(" ")}
    >
      {children}
    </span>
  );
}
