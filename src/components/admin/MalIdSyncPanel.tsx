"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { MalIdSyncStatusDto } from "@/lib/admin/mal-id-sync";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

function statusBadgeClass(status: MalIdSyncStatusDto): string {
  if (status.playableTitles > 0 && status.mappedPlayableTitles >= status.playableTitles) {
    return adminClass.badgeDone;
  }
  if (status.mappedPlayableTitles > 0) return adminClass.badgeRunning;
  return adminClass.badgeIdle;
}

export function MalIdSyncPanel({ initialStatus }: { initialStatus: MalIdSyncStatusDto }) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState<"batch" | "full" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shikimori/mal-id-sync", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status?: MalIdSyncStatusDto };
      if (data.status) setStatus(data.status);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runSync(mode: "batch" | "full") {
    setLoading(mode);
    setMessage(null);

    try {
      const limit = mode === "full" ? status.playableTitles : 500;
      const res = await fetch("/api/admin/shikimori/mal-id-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        status?: MalIdSyncStatusDto;
      };

      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Ошибка запроса" });
        return;
      }

      if (data.status) setStatus(data.status);
      setMessage({ ok: true, text: data.message ?? "Готово" });
    } catch {
      setMessage({ ok: false, text: "Не удалось выполнить запрос" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className={adminClass.panel}>
      <h2 className="text-lg font-semibold text-foreground">MAL ID для AniSkip</h2>
      <p className="mt-2 text-sm text-muted">
        Получает <code className={adminClass.code}>malId</code> через Shikimori GraphQL и хранит
        mapping в <code className={adminClass.code}>AnimeExternalIdMap</code>. Новые тайтлы из Kodik
        sync дозаполняются автоматически в фоне.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`${statusBadgeClass(status)} text-xs font-medium uppercase`}>
          {status.coveragePlayablePct.toFixed(2)}% playable
        </span>
        <span className="text-sm text-muted">Обновлено: {formatDateTime(status.updatedAt)}</span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">Playable с MAL ID</dt>
          <dd className="font-semibold text-foreground">
            {status.mappedPlayableTitles.toLocaleString("ru-RU")} /{" "}
            {status.playableTitles.toLocaleString("ru-RU")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Все тайтлы с MAL ID</dt>
          <dd className="font-semibold text-foreground">
            {status.mappedAllTitles.toLocaleString("ru-RU")} /{" "}
            {status.allTitles.toLocaleString("ru-RU")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Без MAL ID</dt>
          <dd className="font-semibold text-foreground">
            {status.cachedNullAllTitles.toLocaleString("ru-RU")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Старше 30 дней</dt>
          <dd className="font-semibold text-foreground">
            {status.staleCachedTitles.toLocaleString("ru-RU")}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runSync("batch")}
          disabled={loading !== null}
          className={adminClass.btnPrimary}
        >
          {loading === "batch" ? "Синхронизация…" : "Дозаполнить 500"}
        </button>
        <button
          type="button"
          onClick={() => void runSync("full")}
          disabled={loading !== null || status.playableTitles === 0}
          className={adminClass.btnSecondary}
        >
          {loading === "full" ? "Полный прогон…" : "Полный прогон"}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading !== null}
          className={adminClass.btnSecondary}
        >
          Обновить статус
        </button>
      </div>

      {message ? (
        <p className={`mt-3 ${message.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
