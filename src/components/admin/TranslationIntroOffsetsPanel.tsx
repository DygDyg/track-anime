"use client";

import { useCallback, useMemo, useState } from "react";
import { TranslationBadge } from "@/components/TranslationBadge";
import { adminClass } from "@/components/admin/admin-styles";
import type {
  TranslationIntroSettingsDto,
  TranslationIntroStatRow,
} from "@/lib/admin/translation-intro-offsets";
import {
  TRANSLATION_INTRO_OFFSET_MAX_SEC,
  TRANSLATION_INTRO_OFFSET_MIN_SEC,
  TRANSLATION_INTRO_OFFSET_STEP_SEC,
} from "@/lib/translation-intro-offset";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type ApiResponse = TranslationIntroSettingsDto & {
  minSeconds?: number;
  maxSeconds?: number;
  updatedUsers?: number;
  error?: string;
};

type RowState = {
  forcedInput: string;
  saving: boolean;
  applying: boolean;
};

function buildRowState(
  data: TranslationIntroSettingsDto,
  names: string[],
): Record<string, RowState> {
  const keys = new Set<string>([
    ...names,
    ...data.stats.map((row) => row.translationName),
    ...Object.keys(data.forcedOffsets),
  ]);

  const state: Record<string, RowState> = {};
  for (const name of keys) {
    const forced = data.forcedOffsets[name];
    state[name] = {
      forcedInput: forced !== undefined ? String(forced) : "",
      saving: false,
      applying: false,
    };
  }
  return state;
}

function hasNoAverage(row: TranslationIntroStatRow): boolean {
  return row.avgSeconds === null;
}

function isAverageMatchingForced(
  row: TranslationIntroStatRow,
  forcedOffsets: TranslationIntroSettingsDto["forcedOffsets"],
): boolean {
  if (row.avgSeconds === null) return false;
  const forced = forcedOffsets[row.translationName];
  return forced !== undefined && forced > 0 && row.avgSeconds === forced;
}

function mergeStats(
  names: string[],
  stats: TranslationIntroStatRow[],
): TranslationIntroStatRow[] {
  const byName = new Map(stats.map((row) => [row.translationName, row]));
  const merged = names.map(
    (name) =>
      byName.get(name) ?? {
        translationName: name,
        contributors: 0,
        avgSeconds: null,
      },
  );

  for (const row of stats) {
    if (!names.includes(row.translationName)) {
      merged.push(row);
    }
  }

  return merged.sort((a, b) => {
    if (b.contributors !== a.contributors) return b.contributors - a.contributors;
    return a.translationName.localeCompare(b.translationName, "ru");
  });
}

export function TranslationIntroOffsetsPanel({
  initialData,
  translationNames,
}: {
  initialData: TranslationIntroSettingsDto;
  translationNames: string[];
}) {
  const [data, setData] = useState(initialData);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    buildRowState(initialData, translationNames),
  );
  const [hideWithoutAverage, setHideWithoutAverage] = useState(false);
  const [hideMatchingForced, setHideMatchingForced] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const tableRows = useMemo(
    () => mergeStats(translationNames, data.stats),
    [data.stats, translationNames],
  );

  const filteredRows = useMemo(() => {
    let rows = tableRows;
    if (hideWithoutAverage) {
      rows = rows.filter((row) => !hasNoAverage(row));
    }
    if (hideMatchingForced) {
      rows = rows.filter((row) => !isAverageMatchingForced(row, data.forcedOffsets));
    }
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.translationName.toLowerCase().includes(q));
  }, [data.forcedOffsets, hideMatchingForced, hideWithoutAverage, query, tableRows]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/translation-intro-offsets", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as ApiResponse;
      setData(next);
      setRows(buildRowState(next, translationNames));
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, [translationNames]);

  const setRowField = (name: string, patch: Partial<RowState>) => {
    setRows((current) => ({
      ...current,
      [name]: { ...current[name], ...patch },
    }));
  };

  async function saveForced(name: string) {
    const row = rows[name];
    if (!row) return;

    const parsed = row.forcedInput.trim() === "" ? 0 : Number.parseInt(row.forcedInput, 10);
    if (row.forcedInput.trim() !== "" && !Number.isInteger(parsed)) {
      setMessage({ ok: false, text: `«${name}»: укажите целое число секунд` });
      return;
    }
    if (parsed < TRANSLATION_INTRO_OFFSET_MIN_SEC || parsed > TRANSLATION_INTRO_OFFSET_MAX_SEC) {
      setMessage({
        ok: false,
        text: `Секунды: от ${TRANSLATION_INTRO_OFFSET_MIN_SEC} до ${TRANSLATION_INTRO_OFFSET_MAX_SEC}`,
      });
      return;
    }

    setRowField(name, { saving: true });
    setMessage(null);

    try {
      const res = await fetch("/api/admin/translation-intro-offsets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationName: name, forcedSeconds: parsed }),
      });
      const body = (await res.json()) as ApiResponse;

      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? "Не удалось сохранить" });
        return;
      }

      setData(body);
      setRows(buildRowState(body, translationNames));
      setMessage({ ok: true, text: `Принудительное значение для «${name}» сохранено` });
    } catch {
      setMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setRowField(name, { saving: false });
    }
  }

  async function applyToAll(name: string) {
    const row = rows[name];
    if (!row) return;

    const parsed = row.forcedInput.trim() === "" ? 0 : Number.parseInt(row.forcedInput, 10);
    if (!Number.isInteger(parsed)) {
      setMessage({ ok: false, text: `«${name}»: укажите целое число секунд` });
      return;
    }
    if (parsed < TRANSLATION_INTRO_OFFSET_MIN_SEC || parsed > TRANSLATION_INTRO_OFFSET_MAX_SEC) {
      setMessage({
        ok: false,
        text: `Секунды: от ${TRANSLATION_INTRO_OFFSET_MIN_SEC} до ${TRANSLATION_INTRO_OFFSET_MAX_SEC}`,
      });
      return;
    }

    if (
      !window.confirm(
        `Записать ${parsed} сек для «${name}» всем пользователям и установить принудительное значение?`,
      )
    ) {
      return;
    }

    setRowField(name, { applying: true });
    setMessage(null);

    try {
      const res = await fetch("/api/admin/translation-intro-offsets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "applyToAll", translationName: name, seconds: parsed }),
      });
      const body = (await res.json()) as ApiResponse;

      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? "Не удалось применить" });
        return;
      }

      setData(body);
      setRows(buildRowState(body, translationNames));
      setMessage({
        ok: true,
        text: `«${name}»: обновлено пользователей — ${body.updatedUsers ?? 0}`,
      });
    } catch {
      setMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setRowField(name, { applying: false });
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Смещение интро по озвучкам</h2>
        <p className="mt-2 text-sm text-muted">
          Пользователи задают смещение в настройках → Плеер. Среднее считается только по значениям
          больше 0. Принудительное значение перекрывает настройки пользователей при воспроизведении.
        </p>
        <p className="mt-1 text-xs text-muted">Обновлено: {formatDateTime(data.updatedAt)}</p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск озвучки…"
            className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={hideWithoutAverage}
              onChange={(event) => setHideWithoutAverage(event.target.checked)}
              className="site-checkbox"
            />
            Скрыть без среднего
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={hideMatchingForced}
              onChange={(event) => setHideMatchingForced(event.target.checked)}
              className="site-checkbox"
            />
            Скрыть, где среднее совпадает с принудительным
          </label>
        </div>

        {message ? (
          <p className={message.ok ? adminClass.alertSuccess : adminClass.alertError}>{message.text}</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-2 font-medium">Озвучка</th>
                <th className="px-2 py-2 font-medium">Указали</th>
                <th className="px-2 py-2 font-medium">Среднее</th>
                <th className="px-2 py-2 font-medium">Принудительно</th>
                <th className="px-2 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const state = rows[row.translationName] ?? {
                  forcedInput: "",
                  saving: false,
                  applying: false,
                };
                const forcedValue = data.forcedOffsets[row.translationName];

                return (
                  <tr key={row.translationName} className="border-b border-border/70">
                    <td className="px-2 py-2">
                      <TranslationBadge name={row.translationName} className="max-w-[14rem]" />
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted">{row.contributors}</td>
                    <td className="px-2 py-2 tabular-nums text-foreground">
                      {row.avgSeconds !== null ? `${row.avgSeconds} сек` : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-[12rem] flex-col gap-1.5">
                        <span className="text-sm font-semibold tabular-nums text-accent">
                          {state.forcedInput.trim() === ""
                            ? 0
                            : Number.parseInt(state.forcedInput, 10) || 0}{" "}
                          сек
                        </span>
                        <input
                          type="range"
                          min={TRANSLATION_INTRO_OFFSET_MIN_SEC}
                          max={TRANSLATION_INTRO_OFFSET_MAX_SEC}
                          step={TRANSLATION_INTRO_OFFSET_STEP_SEC}
                          value={
                            state.forcedInput.trim() === ""
                              ? 0
                              : Number.parseInt(state.forcedInput, 10) || 0
                          }
                          onChange={(event) =>
                            setRowField(row.translationName, {
                              forcedInput: event.target.value,
                            })
                          }
                          className="site-range w-full"
                        />
                        {forcedValue !== undefined && forcedValue > 0 ? (
                          <span className="text-xs text-accent">активно</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={state.saving || state.applying}
                          onClick={() => void saveForced(row.translationName)}
                          className={adminClass.btnSecondary}
                        >
                          {state.saving ? "Сохранение…" : "Сохранить"}
                        </button>
                        <button
                          type="button"
                          disabled={state.saving || state.applying}
                          onClick={() => void applyToAll(row.translationName)}
                          className={adminClass.btnPrimary}
                        >
                          {state.applying ? "Применение…" : "Всем"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-sm text-muted">Ничего не найдено.</p>
        ) : null}

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void refresh()}
          className={adminClass.btnSecondary}
        >
          {refreshing ? "Обновление…" : "Обновить статистику"}
        </button>
      </section>
    </div>
  );
}
