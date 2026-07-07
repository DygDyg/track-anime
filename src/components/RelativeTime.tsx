"use client";

import { useCallback, useEffect, useState } from "react";
import { useMinuteTicker } from "@/hooks/useMinuteTicker";
import { formatRelativeRu } from "@/lib/dates";

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
    () => (mode === "absolute" ? formatAbsolute(date) : formatRelativeRu(date)),
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
