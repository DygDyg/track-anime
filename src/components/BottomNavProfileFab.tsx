"use client";



import { NavLink } from "@/components/NavLink";

import { usePathname } from "next/navigation";

import { useCallback, useEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { useAuth } from "@/components/auth/AuthProvider";

import { profileMenuItemClass, profileMenuLogoutClass } from "@/components/auth/profile-menu-styles";

import { AvatarWithDecoration } from "@/components/profile/AvatarWithDecoration";

import { useSiteSettings } from "@/components/SiteSettingsProvider";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

import { userProfilePath } from "@/lib/public-user";



function LoginIcon({ className = "h-7 w-7" }: { className?: string }) {

  return (

    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>

      <circle cx="12" cy="8" r="4" />

      <path d="M4 20c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" strokeLinecap="round" />

    </svg>

  );

}



export function BottomNavProfileFab() {

  const { user, logout, login, authNavigating, loggingOut } = useAuth();

  const { settings } = useSiteSettings();

  const pathname = usePathname();

  const [open, setOpen] = useState(false);

  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);



  const profileHref = user ? userProfilePath(user.shikimoriId) : null;

  const profileActive =

    Boolean(profileHref && (pathname === profileHref || pathname.startsWith(`${profileHref}/`))) ||

    pathname === "/profile" ||

    pathname.startsWith("/profile/");



  const avatarDecorationId = settings.avatarDecorationId;
  const avatarDecorationScale = settings.avatarDecorationScale;

  const label = user?.nickname ?? "Войти";



  const updateMenuPos = useCallback(() => {

    const el = buttonRef.current;

    if (!el) return;

    const rect = el.getBoundingClientRect();

    setMenuPos({

      left: rect.left + rect.width / 2,

      bottom: window.innerHeight - rect.top + 8,

    });

  }, []);



  useEffect(() => {

    setOpen(false);

  }, [pathname]);



  useEffect(() => {

    if (!open) {

      setMenuPos(null);

      return;

    }



    updateMenuPos();

    window.addEventListener("resize", updateMenuPos);

    window.addEventListener("scroll", updateMenuPos, true);



    const onPointerDown = (event: PointerEvent) => {

      const target = event.target as Node;

      if (buttonRef.current?.contains(target)) return;

      if (menuRef.current?.contains(target)) return;

      setOpen(false);

    };



    const onKeyDown = (event: KeyboardEvent) => {

      if (event.key === "Escape") setOpen(false);

    };



    document.addEventListener("pointerdown", onPointerDown);

    document.addEventListener("keydown", onKeyDown);

    return () => {

      window.removeEventListener("resize", updateMenuPos);

      window.removeEventListener("scroll", updateMenuPos, true);

      document.removeEventListener("pointerdown", onPointerDown);

      document.removeEventListener("keydown", onKeyDown);

    };

  }, [open, updateMenuPos]);



  const fabButtonClass = [

    "pwa-bottom-nav-fab inline-flex h-full w-full items-center justify-center overflow-visible rounded-full",

    "border border-border bg-card text-muted shadow-[0_0_0_3px_var(--card)]",

    "transition-colors hover:text-foreground",

    profileActive || open ? "text-accent ring-2 ring-accent/35 ring-offset-2 ring-offset-card" : "",

  ].join(" ");



  const labelClass = [

    "absolute inset-x-0 bottom-1 truncate px-0.5 text-center text-[10px] font-medium leading-none",

    profileActive || open ? "text-accent" : "text-muted",

  ].join(" ");



  const menu =

    open && user && menuPos && profileHref

      ? createPortal(

          <div

            ref={menuRef}

            role="menu"

            className="site-header-bg fixed z-[100] w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border/90 py-1 shadow-lg shadow-black/30 backdrop-blur-lg backdrop-saturate-150"

            style={{ left: menuPos.left, bottom: menuPos.bottom }}

          >

            <NavLink

              href={profileHref}

              role="menuitem"

              className={profileMenuItemClass(pathname === profileHref, true)}

              onClick={() => setOpen(false)}

            >

              <span className="truncate">{user.nickname}</span>

            </NavLink>

            <NavLink

              href="/history"

              role="menuitem"

              className={profileMenuItemClass(pathname === "/history", true)}

              onClick={() => setOpen(false)}

            >

              История

            </NavLink>

            <NavLink

              href="/favorites"

              role="menuitem"

              className={profileMenuItemClass(

                pathname === "/favorites" || pathname.startsWith("/favorites/"),

                true,

              )}

              onClick={() => setOpen(false)}

            >

              Избранное

            </NavLink>

            {user.isAdmin ? (

              <NavLink

                href="/admin"

                role="menuitem"

                className={profileMenuItemClass(pathname.startsWith("/admin"), true)}

                onClick={() => setOpen(false)}

              >

                Админ

              </NavLink>

            ) : null}

            <div className="my-1 border-t border-border/80" />

            <button

              type="button"

              role="menuitem"

              disabled={loggingOut}

              aria-busy={loggingOut || undefined}

              className={[profileMenuLogoutClass(true), loggingOut ? "cursor-wait opacity-70" : ""].join(" ")}

              onClick={() => {

                setOpen(false);

                void logout();

              }}

            >

              {loggingOut ? "Выход…" : "Выйти"}

            </button>

          </div>,

          document.body,

        )

      : null;



  if (!user) {

    return (

      <div className="relative h-full w-full">

        <div className="pwa-bottom-nav-fab-slot">

          <button

            type="button"

            onClick={login}

            disabled={authNavigating}

            aria-busy={authNavigating || undefined}

            className={[fabButtonClass, authNavigating ? "cursor-wait opacity-80" : ""].join(" ")}

            aria-label="Войти через Shikimori"

            title="Войти"

          >

            {authNavigating ? <LoadingSpinner size="sm" /> : <LoginIcon />}

          </button>

        </div>

        <span className={labelClass}>{authNavigating ? "Вход…" : label}</span>

      </div>

    );

  }



  return (

    <div className="relative h-full w-full">

      <div className="pwa-bottom-nav-fab-slot">

        <button

          ref={buttonRef}

          type="button"

          onClick={() => setOpen((value) => !value)}

          className={fabButtonClass}

          aria-label={user.nickname}

          aria-expanded={open}

          aria-haspopup="menu"

          title={user.nickname}

        >

          <AvatarWithDecoration
            avatar={user.avatar}
            nickname={user.nickname}
            decorationId={avatarDecorationId}
            decorationScale={avatarDecorationScale}
            size="fab"
          />
        </button>
      </div>

      <span className={labelClass}>{label}</span>

      {menu}

    </div>

  );

}

