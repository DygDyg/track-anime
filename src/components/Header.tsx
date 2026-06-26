"use client";

import Image from "next/image";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useNavigationClick } from "@/components/NavigationProgress";
import { HeaderSearch } from "@/components/search/HeaderSearch";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { SiteSettingsButton } from "@/components/SiteSettingsMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { headerControl } from "@/components/header/header-styles";
import { SITE_LOGO_ALT, SITE_NAME, siteLogoSrc } from "@/lib/site-brand";

const nav = [
  { href: "/", label: "Главная" },
  { href: "/calendar", label: "Календарь" },
  { href: "/history", label: "История" },
];

function PlayersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderPlayersLink() {
  const pathname = usePathname();
  const active = pathname === "/players" || pathname.startsWith("/user/");
  const handleClick = useNavigationClick("/players");

  return (
    <Link
      href="/players"
      onClick={handleClick}
      className={[
        headerControl.icon,
        active ? "text-accent hover:text-accent" : "text-muted hover:text-foreground",
      ].join(" ")}
      aria-label="Игроки Shikimori"
      title="Игроки Shikimori"
    >
      <PlayersIcon />
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
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const handleHomeClick = useNavigationClick("/");

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="site-header fixed top-0 left-0 right-0 z-50 w-full max-w-[100vw] overflow-x-clip supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
      <div
        aria-hidden
        className="site-header-bg site-header-bg-fullbleed border-b border-border/90 backdrop-blur-lg backdrop-saturate-150"
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

        <NavLinks className="hidden shrink-0 items-center gap-1.5 md:ml-2 md:flex" items={nav} />

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <HeaderSearch className="hidden w-44 sm:block sm:w-52 md:w-60 lg:w-72" />

          <HeaderPlayersLink />

          <ThemeToggle className="hidden sm:inline-flex" />

          <SiteSettingsButton />

          <HeaderAuth />

          <button
            type="button"
            className={`${headerControl.icon} md:hidden`}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="mobile-nav"
          className="site-header-text relative space-y-2 border-t border-border/90 bg-card/95 px-3 py-3 backdrop-blur-lg backdrop-saturate-150 md:hidden supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <HeaderSearch onNavigate={() => setMenuOpen(false)} />
          <NavLinks
            className="flex flex-col gap-1.5"
            mobile
            items={nav}
            onNavigate={() => setMenuOpen(false)}
          />
          <div className="flex items-center gap-2 border-t border-border/80 pt-2">
            <ThemeToggle />
            <span className="text-sm text-muted">Тема</span>
          </div>
          <div className="border-t border-border/80 pt-2">
            <HeaderAuth compact />
          </div>
        </div>
      ) : null}
    </header>
  );
}
