"use client";

import { useCallback, useRef, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type {
  CoverCacheAdminStats,
  CoverCacheSettingsDto,
} from "@/lib/admin/cover-cache-settings";
import {
  COVER_SOURCE_LABELS,
  DEFAULT_COVER_SOURCE_ORDER,
  type CoverSourceId,
  type CoverSourceOrderConfig,
} from "@/lib/admin/cover-cache-sources";
import {
  refreshCoverPairInBrowser,
  type CoverRefreshClientProgress,
  type CoverRefreshUiPair,
} from "@/lib/admin/cover-cache-refresh-client";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function maxAgeLabel(days: number): string {
  if (days === 0) return "Не устаревает";
  if (days === 1) return "1 день";
  if (days < 5) return `${days} дня`;
  return `${days} дней`;
}

type SettingsResponse = {
  settings: CoverCacheSettingsDto;
  stats: CoverCacheAdminStats;
  maxAgeOptions: number[];
  browserCacheOptions: number[];
  sourceIds?: CoverSourceId[];
  sourceLabels?: Record<CoverSourceId, string>;
};

function moveSource(
  config: CoverSourceOrderConfig,
  id: CoverSourceId,
  direction: -1 | 1,
): CoverSourceOrderConfig {
  const order = [...config.order];
  const index = order.indexOf(id);
  if (index < 0) return config;
  const next = index + direction;
  if (next < 0 || next >= order.length) return config;
  const tmp = order[index]!;
  order[index] = order[next]!;
  order[next] = tmp;
  return { ...config, order };
}

function toggleSource(config: CoverSourceOrderConfig, id: CoverSourceId): CoverSourceOrderConfig {
  return {
    ...config,
    enabled: {
      ...config.enabled,
      [id]: !config.enabled[id],
    },
  };
}

export function CoverCacheSettingsPanel({
  initialSettings,
  initialStats,
  maxAgeOptions,
  browserCacheOptions,
}: {
  initialSettings: CoverCacheSettingsDto;
  initialStats: CoverCacheAdminStats;
  maxAgeOptions: number[];
  browserCacheOptions: number[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [stats, setStats] = useState(initialStats);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [refreshPairs, setRefreshPairs] = useState<CoverRefreshUiPair[]>([]);
  const [refreshProgress, setRefreshProgress] = useState<CoverRefreshClientProgress | null>(
    null,
  );
  const [showUnchangedPairs, setShowUnchangedPairs] = useState(false);
  const refreshAbortRef = useRef(false);

  const sourceLabels = COVER_SOURCE_LABELS;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cover-cache/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
      setStats(data.stats);
    } catch {
      /* ignore */
    }
  }, []);

  async function savePatch(patch: {
    enabled?: boolean;
    maxAgeDays?: number;
    quality?: number;
    maxHeight?: number;
    browserCacheDays?: number;
    sourceOrder?: CoverSourceOrderConfig;
  }) {
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/cover-cache/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as {
        settings?: CoverCacheSettingsDto;
        stats?: CoverCacheAdminStats;
        error?: string;
      };
      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }
      if (data.settings) setSettings(data.settings);
      if (data.stats) setStats(data.stats);
      setSaveMessage({ ok: true, text: "Настройки сохранены" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  const sourceOrder = settings.sourceOrder ?? DEFAULT_COVER_SOURCE_ORDER;

  async function forceRefreshRecentCovers() {
    const days = 8;
    setRefreshMessage(null);

    let ids: number[] = [];
    try {
      const listRes = await fetch(`/api/admin/cover-cache/refresh-recent?days=${days}`, {
        cache: "no-store",
      });
      const listData = (await listRes.json()) as {
        shikimoriIds?: number[];
        error?: string;
      };
      if (!listRes.ok) {
        setRefreshMessage({
          ok: false,
          text: listData.error ?? "Не удалось получить список тайтлов",
        });
        return;
      }
      ids = Array.isArray(listData.shikimoriIds) ? listData.shikimoriIds : [];
    } catch {
      setRefreshMessage({ ok: false, text: "Ошибка сети при загрузке списка" });
      return;
    }

    if (ids.length === 0) {
      setRefreshMessage({ ok: true, text: "За последние 8 дней релизов нет — прогонять нечего." });
      return;
    }

    if (
      !window.confirm(
        `Будет прогнано ${ids.length.toLocaleString("ru-RU")} тайтлов (релизы за последние ${days} дн.).\n\n` +
          `Для каждого: текущий /api/cover → затем force=true.\n` +
          `Это может занять несколько минут. Запустить?`,
      )
    ) {
      return;
    }

    refreshAbortRef.current = false;
    setRefreshing(true);
    setRefreshPairs([]);
    setRefreshProgress({
      total: ids.length,
      done: 0,
      failed: 0,
      changed: 0,
      currentShikimoriId: ids[0] ?? null,
    });

    const sessionNonce = String(Date.now());

    try {
      let done = 0;
      let failed = 0;
      let changed = 0;

      for (const shikimoriId of ids) {
        if (refreshAbortRef.current) break;

        setRefreshProgress({
          total: ids.length,
          done,
          failed,
          changed,
          currentShikimoriId: shikimoriId,
        });

        const pair = await refreshCoverPairInBrowser(shikimoriId, `${sessionNonce}-${shikimoriId}`);
        done += 1;
        if (!pair.hasAfter) failed += 1;
        if (pair.changed) changed += 1;

        setRefreshPairs((prev) => [...prev, pair]);
        setRefreshProgress({
          total: ids.length,
          done,
          failed,
          changed,
          currentShikimoriId: null,
        });
      }

      const settingsRes = await fetch("/api/admin/cover-cache/settings", { cache: "no-store" });
      if (settingsRes.ok) {
        const settingsData = (await settingsRes.json()) as { stats?: CoverCacheAdminStats };
        if (settingsData.stats) setStats(settingsData.stats);
      }

      setRefreshMessage({
        ok: true,
        text: refreshAbortRef.current
          ? `Остановлено: ${done} из ${ids.length}, изменилось ${changed}, ошибок ${failed}.`
          : `Готово: ${done} из ${ids.length}, изменилось ${changed}, ошибок ${failed}.`,
      });
      void refresh();
    } catch {
      setRefreshMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setRefreshing(false);
      setRefreshProgress((prev) => (prev ? { ...prev, currentShikimoriId: null } : null));
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Кэш обложек</h2>
        <p className="mt-2 text-sm text-muted">
          Сайт всегда запрашивает <code className="text-xs">/api/cover?id=…</code>. Сервер отдаёт
          файл из кэша, если он есть и не устарел. Источники для перекачки настраиваются ниже;
          после первого успешного скачивания следующие не вызываются.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className={adminClass.statLabel}>Файлов в кэше</p>
            <p className={adminClass.statValue}>{stats.count.toLocaleString("ru-RU")}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Размер</p>
            <p className={adminClass.statValue}>{stats.totalSizeMb} MB</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Каталог</p>
            <p className="mt-1 font-mono text-xs text-muted">data/cover-cache</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Пример</p>
            <a
              href="/api/cover?id=5114"
              target="_blank"
              rel="noopener noreferrer"
              className={adminClass.textLink}
            >
              /api/cover?id=5114
            </a>
          </div>
        </div>
      </section>

      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">
          Настройки
          {saving ? <span className="ml-2 text-sm font-normal text-muted">Сохранение…</span> : null}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void savePatch({ enabled: !settings.enabled })}
            className={settings.enabled ? adminClass.btnSmOn : adminClass.btnSmOff}
          >
            {settings.enabled ? "Кэш включён" : "Кэш выключен"}
          </button>
          <span className="text-sm text-muted">
            {settings.enabled
              ? "При промахе обложка скачивается и сохраняется на диск"
              : "Обложки отдаются напрямую с источника без записи в кэш"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Срок жизни файла на сервере (база)</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.maxAgeDays}
              disabled={saving || !settings.enabled}
              onChange={(event) => void savePatch({ maxAgeDays: Number(event.target.value) })}
            >
              {maxAgeOptions.map((days) => (
                <option key={days} value={days}>
                  {maxAgeLabel(days)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              Плюс стабильный разброс 0–7 дней по id (при базе 7 → фактически 7–14), чтобы не
              обновлять все обложки разом.
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-muted">Кэш браузера (Cache-Control)</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.browserCacheDays}
              disabled={saving}
              onChange={(event) =>
                void savePatch({ browserCacheDays: Number(event.target.value) })
              }
            >
              {browserCacheOptions.map((days) => (
                <option key={days} value={days}>
                  {maxAgeLabel(days)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-muted">Качество WebP</span>
            <input
              type="number"
              min={40}
              max={95}
              step={1}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.quality}
              disabled={saving || !settings.enabled}
              onChange={(event) => {
                const quality = Number(event.target.value);
                if (Number.isFinite(quality)) {
                  setSettings((prev) => ({ ...prev, quality }));
                }
              }}
              onBlur={(event) => {
                const quality = Number(event.target.value);
                if (Number.isFinite(quality) && quality !== settings.quality) {
                  void savePatch({ quality });
                }
              }}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Макс. высота (px)</span>
            <input
              type="number"
              min={200}
              max={1200}
              step={10}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.maxHeight}
              disabled={saving || !settings.enabled}
              onChange={(event) => {
                const maxHeight = Number(event.target.value);
                if (Number.isFinite(maxHeight)) {
                  setSettings((prev) => ({ ...prev, maxHeight }));
                }
              }}
              onBlur={(event) => {
                const maxHeight = Number(event.target.value);
                if (Number.isFinite(maxHeight) && maxHeight !== settings.maxHeight) {
                  void savePatch({ maxHeight });
                }
              }}
            />
          </label>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">Порядок загрузки обложек</h3>
          <p className="mt-1 text-xs text-muted">
            Источники вызываются сверху вниз. Как только обложка успешно скачана — стоп. CVH
            использует только уже закэшированный MAL id (без лишнего запроса к Shikimori).
          </p>

          <ul className="mt-3 space-y-2">
            {sourceOrder.order.map((id, index) => {
              const enabled = sourceOrder.enabled[id] !== false;
              const label = sourceLabels[id] ?? id;
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                >
                  <span className="w-6 text-center text-xs text-muted">{index + 1}</span>
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={saving}
                      onChange={() => {
                        const next = toggleSource(sourceOrder, id);
                        setSettings((prev) => ({ ...prev, sourceOrder: next }));
                        void savePatch({ sourceOrder: next });
                      }}
                    />
                    <span className={enabled ? "" : "text-muted line-through"}>{label}</span>
                    <code className="text-[10px] text-muted">{id}</code>
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={adminClass.btnSmOff}
                      disabled={saving || index === 0}
                      aria-label="Выше"
                      onClick={() => {
                        const next = moveSource(sourceOrder, id, -1);
                        setSettings((prev) => ({ ...prev, sourceOrder: next }));
                        void savePatch({ sourceOrder: next });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={adminClass.btnSmOff}
                      disabled={saving || index === sourceOrder.order.length - 1}
                      aria-label="Ниже"
                      onClick={() => {
                        const next = moveSource(sourceOrder, id, 1);
                        setSettings((prev) => ({ ...prev, sourceOrder: next }));
                        void savePatch({ sourceOrder: next });
                      }}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className={`mt-3 ${adminClass.btnSmOff}`}
            disabled={saving}
            onClick={() => {
              setSettings((prev) => ({ ...prev, sourceOrder: DEFAULT_COVER_SOURCE_ORDER }));
              void savePatch({ sourceOrder: DEFAULT_COVER_SOURCE_ORDER });
            }}
          >
            Сбросить порядок по умолчанию
          </button>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Обновлено</dt>
            <dd className="font-semibold text-foreground">{formatDateTime(settings.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Принудительное обновление одного id</dt>
            <dd className="font-semibold text-foreground">
              <code className="text-xs">/api/cover?id=…&amp;force=true</code>
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Force-перекачка свежих релизов
          </h3>
          <p className="mt-1 text-xs text-muted">
            Список id с сервера, дальше прогон в браузере по одному: слева{" "}
            <code className="text-[10px]">/api/cover?id=…</code>, справа тот же id с{" "}
            <code className="text-[10px]">force=true</code> — после пары переход к следующему.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminClass.btnPrimary}
              disabled={saving || refreshing}
              onClick={() => void forceRefreshRecentCovers()}
            >
              {refreshing
                ? refreshProgress
                  ? `Перекачка… ${refreshProgress.done} из ${refreshProgress.total}`
                  : "Перекачка…"
                : "Перекачать обложки за последние 8 дней"}
            </button>
            {refreshing ? (
              <button
                type="button"
                className={adminClass.btnSecondary}
                onClick={() => {
                  refreshAbortRef.current = true;
                }}
              >
                Остановить
              </button>
            ) : null}
          </div>
          {refreshProgress ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold tabular-nums text-foreground">
                  {refreshProgress.done.toLocaleString("ru-RU")} из{" "}
                  {refreshProgress.total.toLocaleString("ru-RU")}
                </span>
                <span className="text-xs text-muted">
                  {refreshProgress.total > 0
                    ? `${Math.round((refreshProgress.done / refreshProgress.total) * 100)}%`
                    : "0%"}
                  {refreshing && refreshProgress.currentShikimoriId
                    ? ` · сейчас #${refreshProgress.currentShikimoriId}`
                    : null}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-black/15"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={refreshProgress.total}
                aria-valuenow={refreshProgress.done}
                aria-label="Прогресс перекачки обложек"
              >
                <div
                  className="h-full rounded-full bg-[var(--accent,#7c5cff)] transition-[width] duration-300"
                  style={{
                    width: `${
                      refreshProgress.total > 0
                        ? Math.min(100, (refreshProgress.done / refreshProgress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted">
                Изменилось {refreshProgress.changed}, ошибок {refreshProgress.failed}
                {refreshing && refreshProgress.currentShikimoriId
                  ? ` · #${refreshProgress.currentShikimoriId}: кэш → force…`
                  : null}
              </p>
            </div>
          ) : null}
          {refreshMessage ? (
            <p
              className={`mt-3 ${refreshMessage.ok ? adminClass.alertSuccess : adminClass.alertError}`}
            >
              {refreshMessage.text}
            </p>
          ) : null}

          {refreshing || refreshPairs.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-foreground">
                  Сравнение: было → стало
                </p>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={showUnchangedPairs}
                    onChange={(event) => setShowUnchangedPairs(event.target.checked)}
                  />
                  Показать без изменений (
                  {refreshPairs.filter((pair) => !pair.changed).length})
                </label>
              </div>

              <div className="grid max-h-[42rem] gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {refreshPairs
                  .filter((pair) => showUnchangedPairs || pair.changed)
                  .map((pair) => (
                    <article
                      key={pair.shikimoriId}
                      className="rounded-lg border border-[var(--border)] p-2"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <a
                          href={`/anime/${pair.shikimoriId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={adminClass.textLink}
                        >
                          #{pair.shikimoriId}
                        </a>
                        <span className="text-muted">
                          {pair.changed ? "изменено" : "без изменений"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                            Было
                          </p>
                          {pair.hasBefore ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={pair.beforeUrl}
                              alt={`Старая обложка ${pair.shikimoriId}`}
                              className="aspect-[3/4] w-full rounded object-cover bg-black/20"
                            />
                          ) : (
                            <div className="flex aspect-[3/4] items-center justify-center rounded bg-black/10 text-[10px] text-muted">
                              не было в кэше
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                            Стало
                          </p>
                          {pair.hasAfter ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={pair.afterUrl}
                              alt={`Новая обложка ${pair.shikimoriId}`}
                              className="aspect-[3/4] w-full rounded object-cover bg-black/20"
                            />
                          ) : (
                            <div className="flex aspect-[3/4] items-center justify-center rounded bg-black/10 text-[10px] text-muted">
                              не скачалось
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          ) : null}
        </div>

        {saveMessage ? (
          <p className={`mt-4 ${saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
            {saveMessage.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
