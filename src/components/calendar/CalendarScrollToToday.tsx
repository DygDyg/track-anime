"use client";

import { useLayoutEffect } from "react";
import { readNavReturn } from "@/lib/navigation-return";

type Props = {
  todayDayOfWeek: number;
};

export function CalendarScrollToToday({ todayDayOfWeek }: Props) {
  useLayoutEffect(() => {
    const path = window.location.pathname + window.location.search;
    const pendingRestore = readNavReturn();
    if (pendingRestore?.path === path) return;

    const target = document.getElementById(`calendar-day-${todayDayOfWeek}`);
    if (!target) return;

    target.scrollIntoView({ behavior: "auto", block: "start" });
  }, [todayDayOfWeek]);

  return null;
}
