"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { profileMenuItemClass, profileMenuLogoutClass } from "@/components/auth/profile-menu-styles";
import { NavLink } from "@/components/NavLink";
import { AvatarWithDecoration } from "@/components/profile/AvatarWithDecoration";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { userProfilePath } from "@/lib/public-user";
import { headerControl } from "@/components/header/header-styles";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { QrCodeScanner } from "@/components/auth/QrCodeScanner";

function LoginIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" strokeLinecap="round" />
    </svg>
  );
}

function LocalCredentialWarningIcon({ className = "absolute -right-1.5 -top-1.5 h-4 w-4 drop-shadow" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Настройте локальный вход" role="img">
      <path d="M12 3.3 21 19.1a1.3 1.3 0 0 1-1.13 1.95H4.13A1.3 1.3 0 0 1 3 19.1L12 3.3Z" fill="#fbbf24" stroke="#fef3c7" strokeWidth="1" />
      <path d="M12 8v6.2M12 17.2v.2" stroke="#422006" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

const profileMenuPanelClass =
  "site-header-bg absolute z-50 mt-1 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/90 py-1 shadow-lg shadow-black/30 backdrop-blur-lg backdrop-saturate-150";

function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout, loggingOut } = useAuth();
  const { settings } = useSiteSettings();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const profileHref = userProfilePath(user.shikimoriId);
  const profileActive =
    Boolean(profileHref && (pathname === profileHref || pathname.startsWith(`${profileHref}/`))) ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/");

  const avatarDecorationId = settings.avatarDecorationId;
  const avatarDecorationScale = settings.avatarDecorationScale;
  const menuCentered = !compact;

  return (
    <div ref={rootRef} className={compact ? "relative w-full" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          compact
            ? [
                headerControl.text,
                "w-full justify-between",
                open ? "bg-foreground/5" : "",
              ].join(" ")
            : [
                "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full",
                "border border-border bg-card text-muted transition-colors hover:text-foreground",
                profileActive || open
                  ? "text-accent ring-2 ring-accent/35 ring-offset-2 ring-offset-card"
                  : "",
              ].join(" ")
        }
        aria-label={user.nickname}
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.nickname}
      >
        {compact ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="relative inline-flex"><AvatarWithDecoration avatar={user.avatar} nickname={user.nickname} decorationId={avatarDecorationId} decorationScale={avatarDecorationScale} size="xs" />{!user.hasLocalCredential ? <LocalCredentialWarningIcon /> : null}</span>
            <span className={`relative truncate rounded-md ${user.hasLocalCredential ? "" : "bg-amber-500/20 px-1.5 py-0.5 text-amber-100"}`}>
              {user.nickname}{!user.hasLocalCredential ? <LocalCredentialWarningIcon className="absolute -right-2 -top-2 h-3.5 w-3.5 drop-shadow" /> : null}
            </span>
          </span>
        ) : (
          <span className="relative inline-flex"><AvatarWithDecoration avatar={user.avatar} nickname={user.nickname} decorationId={avatarDecorationId} decorationScale={avatarDecorationScale} size="sm" />{!user.hasLocalCredential ? <LocalCredentialWarningIcon /> : null}</span>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className={[profileMenuPanelClass, compact ? "left-0 right-0" : "right-0"].join(" ")}
        >
          <NavLink
            href={profileHref}
            role="menuitem"
            className={profileMenuItemClass(pathname === profileHref, menuCentered)}
            onClick={() => setOpen(false)}
          >
            <span className={`relative truncate rounded-md ${user.hasLocalCredential ? "" : "bg-amber-500/20 px-2 py-1 text-amber-100"}`}>
              {user.nickname}{!user.hasLocalCredential ? <LocalCredentialWarningIcon className="absolute -right-2 -top-2 h-3.5 w-3.5 drop-shadow" /> : null}
            </span>
          </NavLink>
          <NavLink
            href="/history"
            role="menuitem"
            className={profileMenuItemClass(pathname === "/history", menuCentered)}
            onClick={() => setOpen(false)}
          >
            История
          </NavLink>
          <NavLink
            href="/favorites"
            role="menuitem"
            className={profileMenuItemClass(
              pathname === "/favorites" || pathname.startsWith("/favorites/"),
              menuCentered,
            )}
            onClick={() => setOpen(false)}
          >
            Избранное
          </NavLink>
          {user.isAdmin ? (
            <NavLink
              href="/admin"
              role="menuitem"
              className={profileMenuItemClass(pathname.startsWith("/admin"), menuCentered)}
              onClick={() => setOpen(false)}
            >
              Админ
            </NavLink>
          ) : null}
          <div className="my-1 border-t border-border/80" />
          <button
            type="button"
            role="menuitem"
            className={profileMenuItemClass(false, menuCentered)}
            onClick={() => { setOpen(false); setScannerOpen(true); }}
          >
            Сканировать QR-код
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            aria-busy={loggingOut || undefined}
            className={[
              profileMenuLogoutClass(menuCentered),
              loggingOut ? "cursor-wait opacity-70" : "",
            ].join(" ")}
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            {loggingOut ? "Выход…" : "Выйти"}
          </button>
        </div>
      ) : null}
      {scannerOpen ? <QrCodeScanner onClose={() => setScannerOpen(false)} onDetected={(code) => { window.location.href = `/login/qr?code=${encodeURIComponent(code)}`; }} /> : null}
    </div>
  );
}

export function HeaderAuth({ compact = false }: { compact?: boolean }) {
  const { user, login, authNavigating } = useAuth();

  if (user) {
    return <ProfileMenu compact={compact} />;
  }

  return (
    <button
      type="button"
      onClick={login}
      disabled={authNavigating}
      aria-busy={authNavigating || undefined}
      className={[
        "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full",
        "border border-border bg-card text-muted transition-colors hover:text-foreground",
        authNavigating ? "cursor-wait opacity-80" : "",
      ].join(" ")}
      aria-label="Войти через Shikimori"
      title="Войти"
    >
      {authNavigating ? <LoadingSpinner size="sm" /> : <LoginIcon />}
    </button>
  );
}
