"use client";

import { useEffect, type ReactNode } from "react";
import { registerPwaServiceWorker } from "@/lib/notifications/browser-client";

export function PwaProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void registerPwaServiceWorker();
  }, []);

  return children;
}
