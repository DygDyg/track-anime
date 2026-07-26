"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/components/auth/AuthProvider";
import { profileMenuItemClass, profileMenuLogoutClass } from "@/components/auth/profile-menu-styles";
import { userProfilePath } from "@/lib/public-user";

export function LocalCredentialWarningIcon({
  className = "absolute -right-1.5 -top-1.5 h-4 w-4 drop-shadow",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Настройте локальный вход" role="img">
      <path d="M12 3.3 21 19.1a1.3 1.3 0 0 1-1.13 1.95H4.13A1.3 1.3 0 0 1 3 19.1L12 3.3Z" fill="#fbbf24" stroke="#fef3c7" strokeWidth="1" />
      <path d="M12 8v6.2M12 17.2v.2" stroke="#422006" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

type ProfileMenuItemsProps = {
  centered?: boolean;
  onNavigate: () => void;
  onScanQr: () => void;
};

/** Shared profile-menu actions for desktop and the mobile navigation. */
export function ProfileMenuItems({ centered = false, onNavigate, onScanQr }: ProfileMenuItemsProps) {
  const { user, logout, loggingOut } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const profileHref = userProfilePath(user.shikimoriId);
  const needsLocalCredential = !user.hasLocalCredential;

  return (
    <>
      <NavLink href={profileHref} role="menuitem" className={profileMenuItemClass(pathname === profileHref, centered)} onClick={onNavigate}>
        <span className={`relative truncate rounded-md ${needsLocalCredential ? "bg-amber-500/20 px-2 py-1 text-amber-100" : ""}`}>
          {user.nickname}
          {needsLocalCredential ? <LocalCredentialWarningIcon className="absolute -right-2 -top-2 h-3.5 w-3.5 drop-shadow" /> : null}
        </span>
      </NavLink>
      <NavLink href="/history" role="menuitem" className={profileMenuItemClass(pathname === "/history", centered)} onClick={onNavigate}>
        История
      </NavLink>
      <NavLink href="/favorites" role="menuitem" className={profileMenuItemClass(pathname === "/favorites" || pathname.startsWith("/favorites/"), centered)} onClick={onNavigate}>
        Избранное
      </NavLink>
      {user.isAdmin ? <NavLink href="/admin" role="menuitem" className={profileMenuItemClass(pathname.startsWith("/admin"), centered)} onClick={onNavigate}>Админ</NavLink> : null}
      <div className="my-1 border-t border-border/80" />
      <button type="button" role="menuitem" className={profileMenuItemClass(false, centered)} onClick={onScanQr}>
        Сканировать QR-код
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={loggingOut}
        aria-busy={loggingOut || undefined}
        className={[profileMenuLogoutClass(centered), loggingOut ? "cursor-wait opacity-70" : ""].join(" ")}
        onClick={() => {
          onNavigate();
          void logout();
        }}
      >
        {loggingOut ? "Выход…" : "Выйти"}
      </button>
    </>
  );
}
