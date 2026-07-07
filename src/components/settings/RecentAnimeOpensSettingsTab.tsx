"use client";

import { useEffect, useState } from "react";
import { AnimeLink } from "@/components/AnimeLink";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  formatRecentAnimeOpenedAt,
  readRecentAnimeOpens,
  fetchRemoteRecentAnimeOpens,
  RECENT_ANIME_OPENS_CHANGED_EVENT,
  RECENT_ANIME_OPENS_MAX,
  writeRecentAnimeOpens,
  type RecentAnimeOpenEntry,
} from "@/lib/recent-anime-opens";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>;
}

export function RecentAnimeOpensSettingsTab() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<RecentAnimeOpenEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refreshLocal = () => setItems(readRecentAnimeOpens());

    const refresh = async () => {
      if (user) {
        try {
          const remote = await fetchRemoteRecentAnimeOpens();
          if (cancelled) return;
          if (remote) {
            writeRecentAnimeOpens(remote);
            setItems(remote);
            return;
          }
        } catch {
          if (!cancelled) refreshLocal();
          return;
        }
      }

      refreshLocal();
    };

    void refresh();
    setHydrated(true);
    window.addEventListener(RECENT_ANIME_OPENS_CHANGED_EVENT, refreshLocal);
    return () => {
      cancelled = true;
      window.removeEventListener(RECENT_ANIME_OPENS_CHANGED_EVENT, refreshLocal);
    };
  }, [user]);

  const loading = !hydrated || authLoading;

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>Недавно открытые</SectionTitle>
        <SectionHint>
          Последние {RECENT_ANIME_OPENS_MAX} тайтлов, страницы которых вы открывали. При повторном
          открытии дата обновляется. {user ? "Список сохраняется в аккаунте." : "Войдите, чтобы синхронизировать между устройствами."}
        </SectionHint>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Пока ничего не открывали.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Открыто</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.shikimoriId} className="border-b border-border/70 last:border-b-0">
                  <td className="px-3 py-2">
                    <AnimeLink
                      href={`/anime/${item.shikimoriId}`}
                      className="font-medium text-foreground transition hover:text-accent"
                    >
                      {item.title}
                    </AnimeLink>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">
                    {formatRecentAnimeOpenedAt(item.openedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
