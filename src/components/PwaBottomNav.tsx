"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNavProfileFab } from "@/components/BottomNavProfileFab";
import { useNavigationClick } from "@/components/NavigationProgress";
import { isStandaloneMode } from "@/hooks/usePwaInstall";
import {
  isPwaNavActive,
  MOBILE_BOTTOM_NAV_MEDIA,
  PWA_NAV_ITEMS,
  shouldShowBottomNav,
} from "@/lib/pwa-nav";

function HomeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.05 11a9 9 0 1 0 .5-3.5" strokeLinecap="round" />
      <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FavoritesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M12 20.5 4.5 12.8C3.5 11.7 3 10.4 3 9a5 5 0 0 1 9-2.7A5 5 0 0 1 21 9c0 1.4-.5 2.7-1.5 3.8L12 20.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV_ICONS: Record<string, typeof HomeIcon> = {
  "/": HomeIcon,
  "/calendar": CalendarIcon,
  "/history": HistoryIcon,
  "/favorites": FavoritesIcon,
};

function PwaBottomNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = isPwaNavActive(pathname, href);
  const handleClick = useNavigationClick(href);
  const Icon = NAV_ICONS[href] ?? HomeIcon;

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={[
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium transition",
        active ? "text-accent" : "text-muted hover:text-foreground",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

export function PwaBottomNav() {
  const pathname = usePathname();
  const [mobileViewport, setMobileViewport] = useState(false);
  const [standalone, setStandalone] = useState(false);

  const leftItems = PWA_NAV_ITEMS.slice(0, 2);
  const rightItems = PWA_NAV_ITEMS.slice(2);

  useEffect(() => {
    const mobileMedia = window.matchMedia(MOBILE_BOTTOM_NAV_MEDIA);
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");

    const sync = () => {
      setMobileViewport(mobileMedia.matches);
      setStandalone(isStandaloneMode());
    };

    sync();
    mobileMedia.addEventListener("change", sync);
    standaloneMedia.addEventListener("change", sync);
    return () => {
      mobileMedia.removeEventListener("change", sync);
      standaloneMedia.removeEventListener("change", sync);
    };
  }, []);

  const visible = shouldShowBottomNav(pathname, { mobileViewport, standalone });

  useEffect(() => {
    document.documentElement.classList.toggle("has-bottom-nav", visible);
    document.documentElement.classList.toggle("pwa-standalone", standalone);
    return () => {
      document.documentElement.classList.remove("has-bottom-nav");
      document.documentElement.classList.remove("pwa-standalone");
    };
  }, [visible, standalone]);

  if (!visible) return null;

  return (
    <nav
      aria-label="Основная навигация"
      className="pwa-bottom-nav fixed inset-x-0 bottom-0 z-50"
    >
      <div
        aria-hidden
        className="site-header-bg pointer-events-none absolute inset-0 backdrop-blur-lg backdrop-saturate-150"
      />
      <div className="relative mx-auto flex h-14 max-w-lg items-stretch px-1 sm:max-w-none sm:px-2">
        <div className="flex min-w-0 flex-1 items-stretch">
          {leftItems.map((item) => (
            <PwaBottomNavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </div>

        <div className="relative flex min-w-[5rem] max-w-[7rem] shrink-0 flex-col items-center justify-end">
          <BottomNavProfileFab />
        </div>

        <div className="flex min-w-0 flex-1 items-stretch">
          {rightItems.map((item) => (
            <PwaBottomNavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </div>
      </div>
    </nav>
  );
}
