"use client";

import { useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type {
  PendingKodikMaterialDto,
  PendingKodikMaterialsDto,
} from "@/lib/admin/pending-kodik-materials";

const PAGE_LIMIT = 50;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function formatEpisodeInfo(item: PendingKodikMaterialDto): string {
  if (item.lastEpisode == null && item.episodesCount == null) return "—";
  const latest = item.lastEpisode != null ? `последняя ${item.lastEpisode}` : null;
  const total = item.episodesCount != null ? `всего ${item.episodesCount}` : null;
  return [latest, total].filter(Boolean).join(" / ");
}

async function fetchPendingMaterials(cursor?: string | null): Promise<PendingKodikMaterialsDto> {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`/api/admin/import/pending-materials?${params.toString()}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as PendingKodikMaterialsDto | { error?: string };
  if (!res.ok) {
    throw new Error("error" in data && data.error ? data.error : "Не удалось загрузить список");
  }
  return data as PendingKodikMaterialsDto;
}

export function PendingKodikMaterialsPanel({
  initialData,
}: {
  initialData: PendingKodikMaterialsDto;
}) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [nextCursor, setNextCursor] = useState(initialData.nextCursor);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const bodyId = "pending-kodik-materials-panel-body";

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchPendingMaterials();
      setItems(data.items);
      setTotal(data.total);
      setNextCursor(data.nextCursor);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось обновить список";
      setMessage({ ok: false, text });
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;

    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchPendingMaterials(nextCursor);
      setItems((current) => [...current, ...data.items]);
      setTotal(data.total);
      setNextCursor(data.nextCursor);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось загрузить ещё";
      setMessage({ ok: false, text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={adminClass.panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Материалы без серий</h2>
          <p className="mt-1 text-sm text-muted">
            Показаны записи KodikMaterial с episodesLoaded=false.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className={adminClass.btnSecondary}
            aria-expanded={expanded}
            aria-controls={bodyId}
          >
            {expanded ? "Свернуть" : "Развернуть"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className={adminClass.btnSecondary}
          >
            {loading ? "Загрузка…" : "Обновить"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span className="text-muted">
          Всего:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {total.toLocaleString("ru-RU")}
          </span>
        </span>
        <span className="text-muted">
          Показано:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {items.length.toLocaleString("ru-RU")}
          </span>
        </span>
      </div>

      {expanded ? (
        <div id={bodyId}>
          {items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Незагруженных материалов нет.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className={adminClass.tableHead}>
                    <th className="px-3 py-2">Материал</th>
                    <th className="px-3 py-2">Озвучка</th>
                    <th className="px-3 py-2">Shikimori</th>
                    <th className="px-3 py-2">Серии</th>
                    <th className="px-3 py-2">Kodik updated</th>
                    <th className="px-3 py-2">Обновлено в БД</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.kodikId} className={adminClass.tableRow}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{item.title}</div>
                        <div className="mt-1 font-mono text-xs text-muted">{item.kodikId}</div>
                        {item.titleOrig ? (
                          <div className="mt-1 text-xs text-muted">{item.titleOrig}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        <div>{item.translationTitle}</div>
                        <div className="mt-1 text-xs text-muted">{item.translationType}</div>
                        {item.isShikimoriStub ? (
                          <span className={`${adminClass.badgeIdle} mt-2`}>Shikimori cache</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {item.shikimoriId != null ? (
                          <a className={adminClass.textLink} href={`/anime/${item.shikimoriId}`}>
                            {item.shikimoriId}
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">{formatEpisodeInfo(item)}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {formatDateTime(item.kodikUpdatedAt)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {formatDateTime(item.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className={`${adminClass.btnSecondary} mt-4`}
            >
              {loading ? "Загрузка…" : "Загрузить ещё"}
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className={`mt-4 ${message.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
