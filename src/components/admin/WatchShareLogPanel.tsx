"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { adminClass } from "@/components/admin/admin-styles";
import type { AnimeWatchShareLogDto } from "@/lib/admin/watch-share-log";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

export function WatchShareLogPanel({
  initialLog,
}: {
  initialLog: AnimeWatchShareLogDto;
}) {
  const [log, setLog] = useState(initialLog);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/audience/watch-share?limit=50", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as AnimeWatchShareLogDto;
      setLog(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className={`${adminClass.panel} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Ссылки на серию</h3>
          <p className="mt-1 text-xs text-muted">
            Копирование deep-link с плеера (кнопка-цепочка): кто создал, тайтл, озвучка, таймкод.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className={adminClass.btnSecondary}
        >
          {loading ? "Обновление…" : "Обновить"}
        </button>
      </div>

      {log.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted">
          Пока никто не копировал ссылку на серию.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Когда</th>
                <th className="py-2 pr-3 font-medium">Кто</th>
                <th className="py-2 pr-3 font-medium">Тайтл</th>
                <th className="py-2 pr-3 font-medium">Плеер</th>
                <th className="py-2 pr-3 font-medium">Серия</th>
                <th className="py-2 pr-3 font-medium">Озвучка</th>
                <th className="py-2 pr-3 font-medium">Таймкод</th>
                <th className="py-2 font-medium">Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {log.items.map((item) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-muted">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      {item.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote Shikimori avatar
                        <img
                          src={item.avatar}
                          alt=""
                          width={20}
                          height={20}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-dim text-[10px] text-muted">
                          ?
                        </span>
                      )}
                      <span className="font-medium text-foreground">
                        {item.nickname}
                        {!item.userId ? (
                          <span className="ml-1 font-normal text-muted">(гость)</span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/anime/${item.shikimoriId}`}
                      className={adminClass.textLink}
                    >
                      {item.animeTitle}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{item.playerLabel}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    S{item.seasonNumber} · E{item.episodeNumber}
                  </td>
                  <td className="py-2.5 pr-3 max-w-[10rem] truncate" title={item.translationTitle ?? undefined}>
                    {item.translationTitle ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {item.positionSeconds > 0 ? item.positionLabel : "начало"}
                    {item.nosave ? (
                      <span className="ml-1 text-muted" title="nosave=1">
                        · без истории
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5">
                    {item.shareUrl ? (
                      <a
                        href={item.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={adminClass.textLink}
                      >
                        открыть
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
