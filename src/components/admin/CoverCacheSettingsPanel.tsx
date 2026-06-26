"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type {
  CoverCacheAdminStats,
  CoverCacheSettingsDto,
} from "@/lib/admin/cover-cache-settings";

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
};

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

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Кэш обложек</h2>
        <p className="mt-2 text-sm text-muted">
          Сайт всегда запрашивает <code className="text-xs">/api/cover?id=…</code>. Сервер отдаёт
          файл из кэша, если он есть и не устарел. Прямая ссылка на Shikimori/Kodik используется
          только при промахе или после истечения срока.
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
        <h2 className="text-lg font-semibold text-foreground">Настройки</h2>

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
            <span className="text-muted">Срок жизни файла на сервере</span>
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

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Обновлено</dt>
            <dd className="font-semibold text-foreground">{formatDateTime(settings.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Принудительное обновление</dt>
            <dd className="font-semibold text-foreground">
              <code className="text-xs">/api/cover?id=…&amp;force=true</code>
            </dd>
          </div>
        </dl>

        {saveMessage ? (
          <p className={`mt-4 ${saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
            {saveMessage.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
