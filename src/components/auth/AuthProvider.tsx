"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AuthLoginPanel } from "@/components/auth/AuthLoginPanel";
import { SHIKIMORI_RELOGIN_MESSAGE } from "@/lib/shikimori/auth-messages";

export type AuthUser = {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  hasLocalCredential: boolean;
};

function authUsersEqual(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.shikimoriId === b.shikimoriId &&
    a.nickname === b.nickname &&
    a.avatar === b.avatar &&
    a.isAdmin === b.isAdmin &&
    a.hasLocalCredential === b.hasLocalCredential
  );
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authNavigating: boolean;
  loggingOut: boolean;
  needsShikimoriFriendsReconnect: boolean;
  shikimoriFriendsEnabled: boolean;
  refresh: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  login: () => void;
  startShikimoriLogin: () => void;
  reconnectShikimori: () => void;
  /** Показать баннер переподключения Shikimori (токен мёртв, TA-сессия жива). */
  notifyShikimoriAuthExpired: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Последний успешно подтверждённый вход (для баннера «вас разлогинило»). */
const LAST_AUTH_USER_KEY = "ta.auth.last-user";

type LastAuthUser = {
  shikimoriId: number;
  nickname: string;
};

function readLastAuthUser(): LastAuthUser | null {
  try {
    const raw = window.localStorage.getItem(LAST_AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastAuthUser>;
    if (
      typeof parsed.shikimoriId !== "number" ||
      !Number.isFinite(parsed.shikimoriId) ||
      parsed.shikimoriId <= 0 ||
      typeof parsed.nickname !== "string"
    ) {
      return null;
    }
    return { shikimoriId: parsed.shikimoriId, nickname: parsed.nickname };
  } catch {
    return null;
  }
}

function writeLastAuthUser(user: AuthUser): void {
  try {
    window.localStorage.setItem(
      LAST_AUTH_USER_KEY,
      JSON.stringify({ shikimoriId: user.shikimoriId, nickname: user.nickname } satisfies LastAuthUser),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function clearLastAuthUser(): void {
  try {
    window.localStorage.removeItem(LAST_AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsShikimoriFriendsReconnect, setNeedsShikimoriFriendsReconnect] = useState(false);
  const [shikimoriFriendsEnabled, setShikimoriFriendsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authNavigating, setAuthNavigating] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [localCredentialReminderOpen, setLocalCredentialReminderOpen] = useState(false);
  const [sessionLostOpen, setSessionLostOpen] = useState(false);
  const [sessionLostUser, setSessionLostUser] = useState<LastAuthUser | null>(null);
  const [shikimoriExpiredOpen, setShikimoriExpiredOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const loginDialogRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<AuthUser | null>(null);
  const intentionalLogoutRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) {
        // 5xx / сеть: не считаем это выходом из учётки
        return userRef.current;
      }
      const data = (await res.json()) as {
        user: AuthUser | null;
        needsShikimoriFriendsReconnect?: boolean;
        shikimoriFriendsEnabled?: boolean;
      };

      if (data.user) {
        writeLastAuthUser(data.user);
        setSessionLostOpen(false);
        setSessionLostUser(null);
        intentionalLogoutRef.current = false;
      } else if (!intentionalLogoutRef.current) {
        const last = readLastAuthUser();
        if (last) {
          setSessionLostUser(last);
          setSessionLostOpen(true);
        }
        setShikimoriExpiredOpen(false);
      }

      // Avoid new object identity on every focus/visibility refresh — consumers like
      // AnimeWatchPanel boot on `user` and remount the Kodik iframe if it changes.
      setUser((previous) => (authUsersEqual(previous, data.user) ? previous : data.user));
      setNeedsShikimoriFriendsReconnect(Boolean(data.needsShikimoriFriendsReconnect));
      setShikimoriFriendsEnabled(Boolean(data.shikimoriFriendsEnabled));
      return data.user;
    } catch {
      return userRef.current;
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!user || user.hasLocalCredential || pathname !== "/") {
      setLocalCredentialReminderOpen(false);
      return;
    }
    const storageKey = `ta.local-credential-alert:${user.shikimoriId}`;
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, "shown");
    setLocalCredentialReminderOpen(true);
  }, [pathname, user]);

  useEffect(() => {
    if (!loginDialogOpen) return;
    loginDialogRef.current?.querySelector<HTMLElement>("[data-tv-autofocus]")?.focus({ preventScroll: true });
  }, [loginDialogOpen]);

  const login = useCallback(() => {
    setSessionLostOpen(false);
    setLoginDialogOpen(true);
  }, []);

  const notifyShikimoriAuthExpired = useCallback(() => {
    setLoginDialogOpen(false);
    setShikimoriExpiredOpen(true);
  }, []);

  const dismissSessionLost = useCallback(() => {
    setSessionLostOpen(false);
    clearLastAuthUser();
    setSessionLostUser(null);
  }, []);

  const startShikimoriLogin = useCallback(() => {
    if (authNavigating) return;
    setAuthNavigating(true);
    window.location.href = "/api/auth/shikimori";
  }, [authNavigating]);

  const reconnectShikimori = useCallback(() => {
    if (authNavigating) return;
    setAuthNavigating(true);
    setShikimoriExpiredOpen(false);
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/auth/shikimori/reconnect?returnTo=${returnTo}`;
  }, [authNavigating]);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    intentionalLogoutRef.current = true;
    clearLastAuthUser();
    setSessionLostOpen(false);
    setSessionLostUser(null);
    setShikimoriExpiredOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setNeedsShikimoriFriendsReconnect(false);
      setShikimoriFriendsEnabled(false);
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut]);

  const value = useMemo(
    () => ({
      user,
      loading,
      authNavigating,
      loggingOut,
      needsShikimoriFriendsReconnect,
      shikimoriFriendsEnabled,
      refresh,
      logout,
      login,
      startShikimoriLogin,
      reconnectShikimori,
      notifyShikimoriAuthExpired,
    }),
    [
      user,
      loading,
      authNavigating,
      loggingOut,
      needsShikimoriFriendsReconnect,
      shikimoriFriendsEnabled,
      refresh,
      logout,
      login,
      startShikimoriLogin,
      reconnectShikimori,
      notifyShikimoriAuthExpired,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {loginDialogOpen && !user ? (
        <div
          ref={loginDialogRef}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Выбор способа входа"
        >
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Вход</h2>
              </div>
              <button
                type="button"
                onClick={() => setLoginDialogOpen(false)}
                className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <AuthLoginPanel
              onLocalSuccess={() => window.location.reload()}
              startShikimoriLogin={startShikimoriLogin}
              authNavigating={authNavigating}
            />
          </div>
        </div>
      ) : null}
      {localCredentialReminderOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Настройка локального входа"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-400/50 bg-card p-5 shadow-2xl shadow-black/60">
            <h2 className="text-lg font-semibold text-amber-200">Настройте запасной вход</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Создайте локальный логин и пароль. Они помогут войти, если Shikimori недоступен, и упростят
              вход по QR-коду.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="/profile"
                onClick={() => setLocalCredentialReminderOpen(false)}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Настроить
              </a>
              <button
                type="button"
                onClick={() => setLocalCredentialReminderOpen(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground"
              >
                Позже
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {sessionLostOpen && !user && sessionLostUser ? (
        <div
          role="status"
          aria-live="polite"
          className="session-lost-banner pointer-events-none fixed inset-x-3 z-[500] mx-auto flex max-w-xl justify-center"
        >
          <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-950/95 p-3.5 text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <p className="text-sm leading-snug">
              Сессия{sessionLostUser.nickname ? ` «${sessionLostUser.nickname}»` : ""} завершилась.
              Войдите снова, чтобы продолжить.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-lg bg-amber-400 px-3.5 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300"
                onClick={login}
              >
                Войти
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-200/40 px-3 py-2 text-sm text-amber-100 hover:bg-amber-900/80"
                onClick={dismissSessionLost}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {shikimoriExpiredOpen && user ? (
        <div
          role="status"
          aria-live="polite"
          className="session-lost-banner pointer-events-none fixed inset-x-3 z-[500] mx-auto flex max-w-xl justify-center"
        >
          <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-950/95 p-3.5 text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <p className="text-sm leading-snug">{SHIKIMORI_RELOGIN_MESSAGE}</p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-lg bg-amber-400 px-3.5 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
                onClick={reconnectShikimori}
                disabled={authNavigating}
              >
                {authNavigating ? "…" : "Переподключить"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-200/40 px-3 py-2 text-sm text-amber-100 hover:bg-amber-900/80"
                onClick={() => setShikimoriExpiredOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
