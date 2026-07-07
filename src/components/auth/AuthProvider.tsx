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

export type AuthUser = {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authNavigating: boolean;
  loggingOut: boolean;
  needsShikimoriFriendsReconnect: boolean;
  shikimoriFriendsEnabled: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  login: () => void;
  reconnectShikimori: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsShikimoriFriendsReconnect, setNeedsShikimoriFriendsReconnect] = useState(false);
  const [shikimoriFriendsEnabled, setShikimoriFriendsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authNavigating, setAuthNavigating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        setNeedsShikimoriFriendsReconnect(false);
        setShikimoriFriendsEnabled(false);
        return;
      }
      const data = (await res.json()) as {
        user: AuthUser | null;
        needsShikimoriFriendsReconnect?: boolean;
        shikimoriFriendsEnabled?: boolean;
      };
      setUser(data.user);
      setNeedsShikimoriFriendsReconnect(Boolean(data.needsShikimoriFriendsReconnect));
      setShikimoriFriendsEnabled(Boolean(data.shikimoriFriendsEnabled));
    } catch {
      setUser(null);
      setNeedsShikimoriFriendsReconnect(false);
      setShikimoriFriendsEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(() => {
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
      reconnectShikimori,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
