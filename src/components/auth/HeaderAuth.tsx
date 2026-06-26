"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { headerControl } from "@/components/header/header-styles";

function UserAvatar({ nickname, avatar }: { nickname: string; avatar: string | null }) {
  if (avatar) {
    return <img src={avatar} alt="" className={headerControl.avatar} />;
  }

  return (
    <span className={headerControl.avatarFallback}>{nickname.slice(0, 1).toUpperCase()}</span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={[
        "h-4 w-4 shrink-0 text-muted transition-transform",
        open ? "rotate-180" : "",
      ].join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const menuItemClass =
    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground transition hover:bg-foreground/5";
  const menuItemActiveClass = "bg-accent/10 text-accent";

  return (
    <div ref={rootRef} className={compact ? "relative w-full" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={[
          headerControl.text,
          compact ? "w-full justify-between" : "",
          open ? "bg-foreground/5" : "",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.nickname}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <UserAvatar nickname={user.nickname} avatar={user.avatar} />
          <span className="truncate">{user.nickname}</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute z-50 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg shadow-black/25",
            compact ? "left-0 right-0" : "right-0",
          ].join(" ")}
        >
          <Link
            href="/profile"
            role="menuitem"
            className={[menuItemClass, pathname === "/profile" ? menuItemActiveClass : ""].join(" ")}
            onClick={() => setOpen(false)}
          >
            Профиль
          </Link>
          <Link
            href="/history"
            role="menuitem"
            className={[menuItemClass, pathname === "/history" ? menuItemActiveClass : ""].join(" ")}
            onClick={() => setOpen(false)}
          >
            История
          </Link>
          <Link
            href="/favorites"
            role="menuitem"
            className={[menuItemClass, pathname === "/favorites" ? menuItemActiveClass : ""].join(" ")}
            onClick={() => setOpen(false)}
          >
            Избранное
          </Link>
          {user.isAdmin ? (
            <Link
              href="/admin"
              role="menuitem"
              className={[menuItemClass, pathname.startsWith("/admin") ? menuItemActiveClass : ""].join(" ")}
              onClick={() => setOpen(false)}
            >
              Админ
            </Link>
          ) : null}
          <div className="my-1 border-t border-border/80" />
          <button
            type="button"
            role="menuitem"
            className={`${menuItemClass} text-muted hover:text-foreground`}
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function HeaderAuth({ compact = false }: { compact?: boolean }) {
  const { user, loading, login } = useAuth();

  if (loading) {
    return <span aria-hidden className={headerControl.skeleton} />;
  }

  if (!user) {
    return (
      <button type="button" onClick={login} className={headerControl.primary}>
        Войти
      </button>
    );
  }

  return <ProfileMenu compact={compact} />;
}
