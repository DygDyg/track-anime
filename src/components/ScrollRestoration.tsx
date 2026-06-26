"use client";

import { useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { consumeNavReturn, restoreScrollY } from "@/lib/navigation-return";

export function ScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useLayoutEffect(() => {
    if (pathname === "/") return;

    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    const nav = consumeNavReturn(path);
    if (!nav) return;

    restoreScrollY(nav.scrollY);
  }, [pathname, searchParams]);

  return null;
}
