"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { AvatarWithDecoration } from "@/components/profile/AvatarWithDecoration";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { userProfilePath } from "@/lib/public-user";
import { headerControl } from "@/components/header/header-styles";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { QrCodeScanner } from "@/components/auth/QrCodeScanner";
import { QrLoginApprovalDialog } from "@/components/auth/QrLoginApprovalDialog";
import { LocalCredentialWarningIcon, ProfileMenuItems } from "@/components/auth/ProfileMenuItems";
import { ProfileMenuPanel } from "@/components/auth/ProfileMenuPanel";
import { DevicePresenceModal } from "@/components/devices/DevicePresenceModal";

function LoginIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" strokeLinecap="round" />
    </svg>
  );
}

/** Только позиция/ширина — хром (фон, бордер) внутри ProfileMenuPanel. */
const profileMenuPanelClass = "fixed z-[100] w-[min(18rem,calc(100vw-2rem))]";

function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [approvalCode, setApprovalCode] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPos = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
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

  if (!user) return null;

  const profileHref = userProfilePath(user.shikimoriId);
  const profileActive =
    Boolean(profileHref && (pathname === profileHref || pathname.startsWith(`${profileHref}/`))) ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/");

  const avatarDecorationId = settings.avatarDecorationId;
  const avatarDecorationScale = settings.avatarDecorationScale;
  const menuCentered = !compact;

  const menu =
    open && menuPos
      ? createPortal(
          <ProfileMenuPanel
            ref={menuRef}
            className={[
              profileMenuPanelClass,
              compact ? "left-4 right-4 w-auto max-w-none" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              compact
                ? { top: menuPos.top, maxHeight: `min(70dvh, calc(100dvh - ${menuPos.top + 8}px))` }
                : {
                    top: menuPos.top,
                    right: menuPos.right,
                    maxHeight: `min(70dvh, calc(100dvh - ${menuPos.top + 8}px))`,
                  }
            }
          >
            <ProfileMenuItems
              centered={menuCentered}
              onNavigate={() => setOpen(false)}
              onScanQr={() => {
                setOpen(false);
                setScannerOpen(true);
              }}
              onOpenDevices={() => {
                setOpen(false);
                setDevicesOpen(true);
              }}
            />
          </ProfileMenuPanel>,
          document.body,
        )
      : null;

  return (
    <div className={compact ? "relative w-full" : "relative"}>
      <button
        ref={buttonRef}
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
            <span className="relative inline-flex">
              <AvatarWithDecoration
                avatar={user.avatar}
                nickname={user.nickname}
                decorationId={avatarDecorationId}
                decorationScale={avatarDecorationScale}
                size="xs"
              />
              {!user.hasLocalCredential ? <LocalCredentialWarningIcon /> : null}
            </span>
            <span
              className={`relative truncate rounded-md ${user.hasLocalCredential ? "" : "bg-amber-500/20 px-1.5 py-0.5 text-amber-100"}`}
            >
              {user.nickname}
              {!user.hasLocalCredential ? (
                <LocalCredentialWarningIcon className="absolute -right-2 -top-2 h-3.5 w-3.5 drop-shadow" />
              ) : null}
            </span>
          </span>
        ) : (
          <span className="relative inline-flex">
            <AvatarWithDecoration
              avatar={user.avatar}
              nickname={user.nickname}
              decorationId={avatarDecorationId}
              decorationScale={avatarDecorationScale}
              size="sm"
            />
            {!user.hasLocalCredential ? <LocalCredentialWarningIcon /> : null}
          </span>
        )}
      </button>

      {menu}
      {scannerOpen ? (
        <QrCodeScanner
          onClose={() => setScannerOpen(false)}
          onDetected={(code) => {
            setScannerOpen(false);
            setApprovalCode(code);
          }}
        />
      ) : null}
      {approvalCode ? <QrLoginApprovalDialog code={approvalCode} onClose={() => setApprovalCode(null)} /> : null}
      <DevicePresenceModal open={devicesOpen} onClose={() => setDevicesOpen(false)} />
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
