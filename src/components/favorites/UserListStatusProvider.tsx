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
import { useAuth } from "@/components/auth/AuthProvider";
import type { UserAnimeListInfo } from "@/lib/user-anime-list-status";

type UserListStatusContextValue = {
  getStatus: (shikimoriId: number) => UserAnimeListInfo | null;
  loading: boolean;
  updateList: (
    shikimoriId: number,
    payload: { listStatus?: string | null; bookmark?: boolean; removeAll?: boolean },
  ) => Promise<UserAnimeListInfo | null>;
};

const UserListStatusContext = createContext<UserListStatusContextValue | null>(null);

export function UserListStatusProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [lists, setLists] = useState<Record<string, UserAnimeListInfo>>({});
  const [loading, setLoading] = useState(false);

  const fetchLists = useCallback(async () => {
    const res = await fetch("/api/user/anime-lists", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load anime lists");
    const data = (await res.json()) as { lists: Record<string, UserAnimeListInfo> };
    return data.lists ?? {};
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLists({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchLists()
      .then((data) => {
        if (!cancelled) setLists(data);
      })
      .catch(() => {
        if (!cancelled) setLists({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, fetchLists]);

  const getStatus = useCallback(
    (shikimoriId: number): UserAnimeListInfo | null => lists[String(shikimoriId)] ?? null,
    [lists],
  );

  const updateList = useCallback(
    async (
      shikimoriId: number,
      payload: { listStatus?: string | null; bookmark?: boolean; removeAll?: boolean },
    ): Promise<UserAnimeListInfo | null> => {
      const res = await fetch(`/api/user/anime-lists/${shikimoriId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        listInfo?: UserAnimeListInfo | null;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось обновить список");
      }

      const listInfo = data.listInfo ?? null;
      setLists((prev) => {
        const key = String(shikimoriId);
        if (!listInfo || (!listInfo.listStatus && !listInfo.isBookmark)) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: listInfo };
      });

      return listInfo;
    },
    [],
  );

  const value = useMemo(
    () => ({
      getStatus,
      loading,
      updateList,
    }),
    [getStatus, loading, updateList],
  );

  return <UserListStatusContext.Provider value={value}>{children}</UserListStatusContext.Provider>;
}

export function useUserListStatus(shikimoriId: number | null | undefined): UserAnimeListInfo | null {
  const ctx = useContext(UserListStatusContext);
  if (!ctx || shikimoriId == null) return null;
  return ctx.getStatus(shikimoriId);
}

export function useUserListStatusActions() {
  const ctx = useContext(UserListStatusContext);
  if (!ctx) {
    throw new Error("useUserListStatusActions must be used within UserListStatusProvider");
  }
  return ctx;
}

export function useUserListStatusMap(): {
  getStatus: (shikimoriId: number) => UserAnimeListInfo | null;
  loading: boolean;
} {
  const ctx = useContext(UserListStatusContext);
  if (!ctx) {
    return {
      getStatus: () => null,
      loading: false,
    };
  }
  return { getStatus: ctx.getStatus, loading: ctx.loading };
}
