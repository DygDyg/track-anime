"use client";

import { useMemo, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import type { HolidayThemeSettingsDto } from "@/lib/admin/holiday-theme-settings";
import {
  HOLIDAY_THEME_CATALOG,
  clampDayForMonth,
  findHolidayWindowsForMonthDay,
  getMoscowDateIso,
  holidayCatalogLabel,
  type HolidayThemeCatalogEntry,
  type HolidayThemeId,
  type HolidayWindowConfig,
} from "@/lib/holiday-theme";

const MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];

const HOLIDAY_COLORS: Record<HolidayThemeId, string> = {
  halloween: "#f97316",
  ny: "#7dd3fc",
  valentine: "#fb7185",
  march8: "#e4376f",
  feb23: "#a3e635",
  cosmonautics: "#818cf8",
  april1: "#fbbf24",
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatWindow(w: HolidayWindowConfig): string {
  const a = `${String(w.startDay).padStart(2, "0")}.${String(w.startMonth).padStart(2, "0")}`;
  const b = `${String(w.endDay).padStart(2, "0")}.${String(w.endMonth).padStart(2, "0")}`;
  return a === b ? a : `${a} – ${b}`;
}

type SaveResponse = {
  settings?: HolidayThemeSettingsDto;
  error?: string;
};

function MonthCell({
  year,
  month,
  windows,
  todayIso,
}: {
  year: number;
  month: number;
  windows: HolidayWindowConfig[];
  todayIso: string;
}) {
  const dim = daysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset = (firstDow + 6) % 7; // Monday-first
  const cells: Array<{ day: number | null; hits: HolidayWindowConfig[] }> = [];

  for (let i = 0; i < offset; i += 1) cells.push({ day: null, hits: [] });
  for (let day = 1; day <= dim; day += 1) {
    cells.push({ day, hits: findHolidayWindowsForMonthDay(windows, month, day) });
  }

  return (
    <div className="rounded-lg border border-border bg-background/60 p-2">
      <p className="mb-1 text-center text-xs font-semibold text-foreground">{MONTH_LABELS[month - 1]}</p>
      <div className="mb-1 grid grid-cols-7 gap-px text-[9px] text-muted">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
          <span key={d} className="text-center">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((cell, idx) => {
          if (cell.day === null) {
            return <span key={`e-${idx}`} className="aspect-square" />;
          }
          const iso = `${year}-${String(month).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
          const isToday = iso === todayIso;
          const top = cell.hits[0];
          const color = top ? HOLIDAY_COLORS[top.id] : undefined;
          return (
            <span
              key={iso}
              title={
                cell.hits.length
                  ? cell.hits.map((h) => holidayCatalogLabel(h.id)).join(", ")
                  : undefined
              }
              className={`flex aspect-square items-center justify-center rounded-sm text-[10px] ${
                isToday ? "ring-1 ring-accent" : ""
              }`}
              style={
                color
                  ? {
                      backgroundColor: `${color}33`,
                      color: color,
                      fontWeight: 600,
                    }
                  : { color: "var(--muted)" }
              }
            >
              {cell.day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function WindowEditor({
  window,
  catalog,
  disabled,
  testActive,
  onChange,
  onToggleTest,
}: {
  window: HolidayWindowConfig;
  catalog: HolidayThemeCatalogEntry;
  disabled: boolean;
  testActive: boolean;
  onChange: (next: HolidayWindowConfig) => void;
  onToggleTest: () => void;
}) {
  const dayOptions = (month: number) =>
    Array.from({ length: daysInMonth(2024, month) }, (_, i) => i + 1);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={window.enabled}
            disabled={disabled}
            onChange={(e) => onChange({ ...window, enabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: HOLIDAY_COLORS[window.id] }}
                aria-hidden
              />
              <span className="font-medium text-foreground">{catalog.label}</span>
              {!catalog.implemented ? (
                <span className="rounded bg-surface-dim px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  UI позже
                </span>
              ) : (
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                  в сайте
                </span>
              )}
              {testActive ? (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                  тест у вас
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-xs text-muted">{catalog.hint}</span>
            <span className="mt-1 block text-xs text-muted">
              Окно: {formatWindow(window)} (ежегодно, Москва)
            </span>
          </span>
        </label>
        <button
          type="button"
          className={[
            "shrink-0 self-start",
            testActive ? adminClass.btnSmOn : adminClass.btnSmOff,
          ].join(" ")}
          onClick={onToggleTest}
          title={
            testActive
              ? "Выключить тестовую тему у себя"
              : "Принудительно показать эту тему только вам (в этом браузере)"
          }
        >
          {testActive ? "Выкл. тест" : "Тестовое включение"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          С
          <span className="mt-1 flex gap-2">
            <select
              className={adminClass.input}
              disabled={disabled}
              value={window.startDay}
              onChange={(e) =>
                onChange({
                  ...window,
                  startDay: clampDayForMonth(window.startMonth, Number(e.target.value)),
                })
              }
            >
              {dayOptions(window.startMonth).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className={adminClass.input}
              disabled={disabled}
              value={window.startMonth}
              onChange={(e) => {
                const startMonth = Number(e.target.value);
                onChange({
                  ...window,
                  startMonth,
                  startDay: clampDayForMonth(startMonth, window.startDay),
                });
              }}
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="text-xs text-muted">
          По
          <span className="mt-1 flex gap-2">
            <select
              className={adminClass.input}
              disabled={disabled}
              value={window.endDay}
              onChange={(e) =>
                onChange({
                  ...window,
                  endDay: clampDayForMonth(window.endMonth, Number(e.target.value)),
                })
              }
            >
              {dayOptions(window.endMonth).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className={adminClass.input}
              disabled={disabled}
              value={window.endMonth}
              onChange={(e) => {
                const endMonth = Number(e.target.value);
                onChange({
                  ...window,
                  endMonth,
                  endDay: clampDayForMonth(endMonth, window.endDay),
                });
              }}
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
    </div>
  );
}

export function HolidayThemeSettingsPanel({
  initialSettings,
  catalog = HOLIDAY_THEME_CATALOG,
}: {
  initialSettings: HolidayThemeSettingsDto;
  catalog?: HolidayThemeCatalogEntry[];
}) {
  const { settings: siteSettings, updateLocalSettings } = useSiteSettings();
  const [settings, setSettings] = useState(initialSettings);
  const [draftWindows, setDraftWindows] = useState(initialSettings.windows);
  const [masterEnabled, setMasterEnabled] = useState(initialSettings.enabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const forceId = siteSettings.holidayAdminForceId;

  const todayIso = useMemo(() => getMoscowDateIso(), []);
  const calendarYear = useMemo(() => Number(todayIso.slice(0, 4)) || new Date().getFullYear(), [todayIso]);

  const dirty =
    masterEnabled !== settings.enabled ||
    JSON.stringify(draftWindows) !== JSON.stringify(settings.windows);

  const previewWindows = masterEnabled ? draftWindows.filter((w) => w.enabled) : [];

  function patchWindow(id: HolidayThemeId, next: HolidayWindowConfig) {
    setDraftWindows((prev) => prev.map((w) => (w.id === id ? next : w)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/holiday-theme/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: masterEnabled, windows: draftWindows }),
      });
      const data = (await res.json()) as SaveResponse;
      if (!res.ok || !data.settings) {
        setMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }
      setSettings(data.settings);
      setDraftWindows(data.settings.windows);
      setMasterEnabled(data.settings.enabled);
      setMessage({
        ok: true,
        text: data.settings.public.active
          ? `Сохранено. Сейчас активно: ${holidayCatalogLabel(data.settings.public.active)}`
          : "Сохранено. Сейчас ни одна тема не активна",
      });
    } catch {
      setMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    setDraftWindows(settings.windows);
    setMasterEnabled(settings.enabled);
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Праздничные темы</h2>
        <p className="mt-2 text-sm text-muted">
          Расписание ежегодных окон (часовой пояс Europe/Moscow). Пока в интерфейсе сайта
          реализован только Хэллоуин — остальные можно заранее расставить в календаре. У
          пользователей — чекбокс «Включить праздники». «Тестовое включение» включает тему только
          вам в этом браузере.
        </p>
        {settings.public.active ? (
          <p className="mt-2 text-sm text-accent">
            Сейчас по календарю: {holidayCatalogLabel(settings.public.active)} ({settings.public.moscowDate})
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">Сейчас по календарю тема не активна ({todayIso}).</p>
        )}
        {forceId ? (
          <p className="mt-2 text-sm text-amber-300">
            У вас тестово включено: {holidayCatalogLabel(forceId)}
          </p>
        ) : null}
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={masterEnabled}
            disabled={saving}
            onChange={(e) => setMasterEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">Включить праздничные темы</span>
            <span className="mt-1 block text-xs text-muted">
              Мастер-выключатель. При выключении авто-режим у всех пользователей не включает декор.
            </span>
          </span>
        </label>

        <div className="space-y-3">
          {draftWindows.map((window) => {
            const entry = catalog.find((c) => c.id === window.id);
            if (!entry) return null;
            return (
              <WindowEditor
                key={window.id}
                window={window}
                catalog={entry}
                disabled={saving || !masterEnabled}
                testActive={forceId === window.id}
                onChange={(next) => patchWindow(window.id, next)}
                onToggleTest={() => {
                  const next = forceId === window.id ? null : window.id;
                  updateLocalSettings({ holidayAdminForceId: next });
                  setMessage({
                    ok: true,
                    text: next
                      ? `Тест: ${holidayCatalogLabel(next)} — только у вас`
                      : "Тестовая тема выключена",
                  });
                }}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={adminClass.btnPrimary}
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            className={adminClass.btnSecondary}
            disabled={saving || !dirty}
            onClick={resetDraft}
          >
            Отменить
          </button>
          {message ? (
            <span className={`text-sm ${message.ok ? "text-accent" : "text-red-400"}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      </section>

      <section className={`${adminClass.panel} space-y-3`}>
        <h3 className="text-base font-semibold text-foreground">Календарь {calendarYear}</h3>
        <p className="text-xs text-muted">
          Подсветка по текущему черновику (только включённые окна). При пересечении берётся тема с
          меньшим priority.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <MonthCell
              key={i + 1}
              year={calendarYear}
              month={i + 1}
              windows={previewWindows}
              todayIso={todayIso}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
