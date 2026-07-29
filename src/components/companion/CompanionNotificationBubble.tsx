"use client";

import { useEffect, useState } from "react";
import { NotificationToastBody } from "@/components/NotificationToastBody";
import {
  NOTIFICATION_TOAST_EVENT,
  NOTIFICATION_TOAST_MS,
  type NotificationToastItem,
} from "@/lib/notifications/toast-ui";

/** Speech-bubble toasts anchored above the Aqua Coder avatar. */
export function CompanionNotificationBubbles() {
  const [toasts, setToasts] = useState<NotificationToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<NotificationToastItem>).detail;
      if (!detail?.id) return;
      setToasts((prev) => [...prev, detail]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== detail.id));
      }, NOTIFICATION_TOAST_MS);
    };

    window.addEventListener(NOTIFICATION_TOAST_EVENT, onToast as EventListener);
    return () => {
      window.removeEventListener(NOTIFICATION_TOAST_EVENT, onToast as EventListener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none flex w-[min(20rem,calc(var(--aqua-companion-width,12rem)+7rem))] flex-col items-end gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <NotificationToastBody
          key={toast.id}
          toast={toast}
          className={[
            "companion-speech-bubble pointer-events-auto relative mb-1 rounded-2xl border border-white/80 bg-card/95 p-2.5 shadow-lg shadow-black/30 backdrop-blur-md backdrop-saturate-150 transition hover:border-accent/45",
            toast.kind === "history-new" ? "flex gap-2.5" : "block min-w-[12rem]",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
