"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useNavigationClick } from "@/components/NavigationProgress";

type Props = ComponentProps<typeof Link> & {
  children: ReactNode;
};

function hrefToString(href: ComponentProps<typeof Link>["href"]): string {
  if (typeof href === "string") return href;
  const pathname = href.pathname ?? "/";
  if (!href.query || typeof href.query !== "object") return pathname;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) params.append(key, String(item));
      }
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Внутренняя ссылка с полоской прогресса навигации сверху. */
export function NavLink({ prefetch = true, onClick, href, children, ...rest }: Props) {
  const handleNavClick = useNavigationClick(hrefToString(href));

  return (
    <Link
      prefetch={prefetch}
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        handleNavClick(event);
      }}
    >
      {children}
    </Link>
  );
}
