"use client";

import { useEffect, useState } from "react";

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function SiteClock({ className = "" }: { className?: string }) {
  const [time, setTime] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const update = () => setTime(formatClock(new Date()));
    update();
    const intervalId = window.setInterval(update, 15_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <time
      dateTime={time}
      className={[
        "inline-flex select-none items-center rounded-md border border-border/80 bg-background/70 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground/90 backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      {time}
    </time>
  );
}
