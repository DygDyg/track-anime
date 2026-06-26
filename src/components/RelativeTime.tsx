"use client";

import { useCallback, useEffect, useState } from "react";
import { useMinuteTicker } from "@/hooks/useMinuteTicker";

function formatRelative(date: Date | string) {
  const time = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diffMs = Date.now() - time;
  const absMinutes = Math.floor(Math.abs(diffMs) / 60000);

  if (absMinutes < 1) return "только что";

  if (diffMs < 0) {
    if (absMinutes < 60) return `через ${absMinutes} мин.`;
    const hours = Math.floor(absMinutes / 60);
    if (hours < 24) return `через ${hours} ч.`;
    const days = Math.floor(hours / 24);
    return `через ${days} дн.`;
  }

  if (absMinutes < 60) return `${absMinutes} мин. назад`;
  const hours = Math.floor(absMinutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн. назад`;
}

function formatAbsolute(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RelativeTime({
  date,
  className,
  mode = "relative",
}: {
  date: Date | string;
  className?: string;
  mode?: "relative" | "absolute";
}) {
  const compute = useCallback(
    () => (mode === "absolute" ? formatAbsolute(date) : formatRelative(date)),
    [date, mode],
  );
  const [label, setLabel] = useState(() => compute());

  useEffect(() => {
    setLabel(compute());
  }, [compute]);

  useMinuteTicker(() => {
    if (mode === "relative") setLabel(compute());
  });

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  );
}
