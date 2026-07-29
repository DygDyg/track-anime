"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  emitDigestToast,
  formatMoscowWeekdayTime,
  formatTodayScheduleBody,
  moscowDateKey,
} from "@/lib/notifications/toast-ui";

const STORAGE_PREFIX = "ta:today-history-toast:";

function alreadyShownToday(userId: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}`) === moscowDateKey();
  } catch {
    return false;
  }
}

function markShownToday(userId: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, moscowDateKey());
  } catch {
    /* ignore */
  }
}

async function maybeShowTodayFromHistoryToast(userId: string): Promise<void> {
  if (alreadyShownToday(userId)) return;

  let response: Response;
  try {
    response = await fetch("/api/notifications/today-from-history", { cache: "no-store" });
  } catch {
    return;
  }
  if (response.status === 401 || !response.ok) return;

  const data = (await response.json()) as { count?: number };
  const count = typeof data.count === "number" ? data.count : 0;
  markShownToday(userId);
  emitDigestToast({
    title: formatMoscowWeekdayTime(),
    body: formatTodayScheduleBody(count),
    url: "/calendar",
  });
}

/** Once per Moscow day after login/session restore: digest bubble if history has airings today. */
export function TodayFromHistoryToastListener() {
  const { user, loading } = useAuth();
  const requestedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) {
      requestedForUserRef.current = null;
      return;
    }
    if (requestedForUserRef.current === user.id) return;
    requestedForUserRef.current = user.id;
    void maybeShowTodayFromHistoryToast(user.id);
  }, [user, loading]);

  return null;
}
