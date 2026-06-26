"use client";

import Link, { type LinkProps } from "next/link";
import { useNavigationClick } from "@/components/NavigationProgress";
import { notifyBeforeAnimeNav } from "@/lib/navigation-return";

type Props = LinkProps & {
  children: React.ReactNode;
  className?: string;
};

function hrefToString(href: LinkProps["href"]): string {
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

/** Ссылка на страницу аниме без prefetch (не забивает очередь Shikimori). */
export function AnimeLink({ prefetch = false, onClick, href, ...props }: Props) {
  const handleNavClick = useNavigationClick(hrefToString(href));

  return (
    <Link
      prefetch={prefetch}
      href={href}
      {...props}
      onClick={(event) => {
        notifyBeforeAnimeNav();
        onClick?.(event);
        handleNavClick(event);
      }}
    />
  );
}
