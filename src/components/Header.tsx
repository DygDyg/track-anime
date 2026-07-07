"use client";

import Image from "next/image";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useNavigationClick } from "@/components/NavigationProgress";
import { HeaderSearch } from "@/components/search/HeaderSearch";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { HeaderDiscordRpcButton } from "@/components/HeaderDiscordRpcButton";
import { HeaderPwaInstallButton } from "@/components/HeaderPwaInstallButton";
import { SiteSettingsButton } from "@/components/SiteSettingsMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { headerControl } from "@/components/header/header-styles";
import { PWA_NAV_ITEMS } from "@/lib/pwa-nav";
import { SITE_LOGO_ALT, SITE_NAME, siteLogoSrc } from "@/lib/site-brand";

function HeaderSearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderUsersLink() {
  const pathname = usePathname();
  const active = pathname === "/user" || pathname.startsWith("/user/");
  const handleClick = useNavigationClick("/user");

  return (
    <Link
      href="/user"
      onClick={handleClick}
      className={[
        headerControl.icon,
        active ? "text-accent hover:text-accent" : "text-muted hover:text-foreground",
      ].join(" ")}
      aria-label="Пользователи Shikimori"
      title="Пользователи Shikimori"
    >
      <UsersIcon />
    </Link>
  );
}

function NavLinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
    />
  );
}

function HeaderNavLink({
  href,
  label,
  active,
  mobile = false,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const handleClick = useNavigationClick(
    href,
    onNavigate
      ? () => {
          onNavigate();
        }
      : undefined,
  );

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={mobile ? headerControl.navMobile(active) : headerControl.nav(active)}
    >
      {label}
      <NavLinkPending />
    </Link>
  );
}

function NavLinks({
  onNavigate,
  className,
  mobile = false,
  items,
}: {
  onNavigate?: () => void;
  className?: string;
  mobile?: boolean;
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <HeaderNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={active}
            mobile={mobile}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}

export function Header() {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const pathname = usePathname();
  const handleHomeClick = useNavigationClick("/");
  const searchActive =
    mobileSearchOpen || pathname === "/search" || pathname.startsWith("/search/");

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("mobile-bottom-search-open", mobileSearchOpen);
    return () => {
      document.documentElement.classList.remove("mobile-bottom-search-open");
    };
  }, [mobileSearchOpen]);

  return (
    <header className="site-header fixed top-0 left-0 right-0 z-50 w-full max-w-[100vw] overflow-x-clip supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
      <div
        aria-hidden
        className="site-header-bg site-header-bg-fullbleed backdrop-blur-lg backdrop-saturate-150"
      />
      <div className="site-header-text relative flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-2.5 sm:px-6 lg:px-8">
        <Link
          href="/"
          onClick={handleHomeClick}
          className={`${headerControl.text} inline-flex shrink-0 items-center gap-2 font-semibold tracking-tight`}
        >
          <Image
            src={siteLogoSrc()}
            alt={SITE_LOGO_ALT}
            width={160}
            height={48}
            className="h-8 w-auto sm:h-9"
            priority
          />
          <span className="hidden truncate sm:inline">{SITE_NAME}</span>
        </Link>

        <NavLinks
          className="hidden shrink-0 items-center gap-1.5 md:ml-2 md:flex"
          items={PWA_NAV_ITEMS}
        />

        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5 md:gap-2">
          <HeaderSearch className="hidden w-44 sm:block sm:w-52 md:w-60 lg:w-72" />

          <HeaderDiscordRpcButton />
          <HeaderPwaInstallButton />

          <HeaderUsersLink />

          <ThemeToggle />

          <SiteSettingsButton />

          <div className="hidden md:contents">
            <HeaderAuth />
          </div>

          <button
            type="button"
            className={[
              headerControl.icon,
              "md:hidden",
              searchActive ? "text-accent hover:text-accent" : "text-muted hover:text-foreground",
            ].join(" ")}
            aria-label={mobileSearchOpen ? "Закрыть поиск" : "Поиск аниме"}
            aria-expanded={mobileSearchOpen}
            onClick={() => setMobileSearchOpen((open) => !open)}
          >
            <HeaderSearchIcon />
          </button>
        </div>
      </div>

      <div className="md:hidden">
        <HeaderSearch
          variant="bottom"
          sheetOpen={mobileSearchOpen}
          autoFocus
          onNavigate={() => setMobileSearchOpen(false)}
        />
      </div>
    </header>
  );
}
