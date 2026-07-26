"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AuthLoginPanel } from "@/components/auth/AuthLoginPanel";

export type AuthUser = {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  hasLocalCredential: boolean;
};

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
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsShikimoriFriendsReconnect, setNeedsShikimoriFriendsReconnect] = useState(false);
  const [shikimoriFriendsEnabled, setShikimoriFriendsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authNavigating, setAuthNavigating] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [localCredentialReminderOpen, setLocalCredentialReminderOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        setNeedsShikimoriFriendsReconnect(false);
        setShikimoriFriendsEnabled(false);
        return null;
      }
      const data = (await res.json()) as {
        user: AuthUser | null;
        needsShikimoriFriendsReconnect?: boolean;
        shikimoriFriendsEnabled?: boolean;
      };
      setUser(data.user);
      setNeedsShikimoriFriendsReconnect(Boolean(data.needsShikimoriFriendsReconnect));
      setShikimoriFriendsEnabled(Boolean(data.shikimoriFriendsEnabled));
      return data.user;
    } catch {
      setUser(null);
      setNeedsShikimoriFriendsReconnect(false);
      setShikimoriFriendsEnabled(false);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
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

  const login = useCallback(() => {
    setLoginDialogOpen(true);
  }, []);

  const startShikimoriLogin = useCallback(() => {
    if (authNavigating) return;
    setAuthNavigating(true);
    window.location.href = "/api/auth/shikimori";
  }, [authNavigating]);

  const reconnectShikimori = useCallback(() => {
    if (authNavigating) return;
    setAuthNavigating(true);
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/auth/shikimori/reconnect?returnTo=${returnTo}`;
  }, [authNavigating]);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
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
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {loginDialogOpen && !user ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label="Выбор способа входа">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-foreground">Вход</h2></div>
              <button type="button" onClick={() => setLoginDialogOpen(false)} className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground" aria-label="Закрыть">×</button>
            </div>
            <AuthLoginPanel onLocalSuccess={() => window.location.reload()} startShikimoriLogin={startShikimoriLogin} authNavigating={authNavigating} />
          </div>
        </div>
      ) : null}
      {localCredentialReminderOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label="Настройка локального входа">
          <div className="w-full max-w-sm rounded-2xl border border-amber-400/50 bg-card p-5 shadow-2xl shadow-black/60">
            <h2 className="text-lg font-semibold text-amber-200">Настройте запасной вход</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">Создайте локальный логин и пароль. Они помогут войти, если Shikimori недоступен, и упростят вход по QR-коду.</p>
            <div className="mt-5 flex gap-3"><a href="/profile" onClick={() => setLocalCredentialReminderOpen(false)} className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white">Настроить</a><button type="button" onClick={() => setLocalCredentialReminderOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground">Позже</button></div>
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
