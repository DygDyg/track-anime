"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import {
  DB_EXPLORER_MODELS,
  DB_MODEL_KEYS,
  type DbModelKey,
  type DbSearchMode,
  type DbSearchResult,
} from "@/lib/admin/db-explorer";

type ModelMeta = {
  key: DbModelKey;
  label: string;
  columns: string[];
  searchable: Record<string, { label: string; type: string }>;
};

type Props = {
  tableCounts: Record<DbModelKey, number | null>;
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AdminDbExplorer({ tableCounts }: Props) {
  const models = useMemo<ModelMeta[]>(
    () =>
      DB_MODEL_KEYS.map((key) => ({
        key,
        label: DB_EXPLORER_MODELS[key].label,
        columns: DB_EXPLORER_MODELS[key].columns,
        searchable: DB_EXPLORER_MODELS[key].searchable,
      })),
    [],
  );

  const [model, setModel] = useState<DbModelKey>("KodikMaterial");
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<DbSearchMode>("contains");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DbSearchResult | null>(null);

  const currentModel = models.find((item) => item.key === model)!;
  const searchableFields = Object.entries(currentModel.searchable);

  const fetchResults = useCallback(
    async (opts: {
      modelKey: DbModelKey;
      searchField: string;
      searchValue: string;
      searchMode: DbSearchMode;
      nextPage: number;
    }) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        model: opts.modelKey,
        page: String(opts.nextPage),
        limit: "25",
      });
      if (opts.searchField && opts.searchValue.trim()) {
        params.set("field", opts.searchField);
        params.set("value", opts.searchValue.trim());
        params.set("mode", opts.searchMode);
      }

      try {
        const res = await fetch(`/api/admin/db/search?${params.toString()}`);
        const data = (await res.json()) as DbSearchResult & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Ошибка запроса");
          return;
        }
        setResult(data);
        setPage(data.page);
      } catch {
        setError("Ошибка сети");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setValue("");
    setField("");
    void fetchResults({ modelKey: model, searchField: "", searchValue: "", searchMode: mode, nextPage: 1 });
  }, [model, fetchResults]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void fetchResults({ modelKey: model, searchField: field, searchValue: value, searchMode: mode, nextPage: 1 });
  }

  const selectedFieldType = field ? currentModel.searchable[field]?.type : null;

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Размер таблиц</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setModel(item.key)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                model === item.key
                  ? "border-accent bg-surface-dim text-foreground"
                  : "border-border bg-background text-muted hover:border-accent hover:text-foreground"
              }`}
            >
              <span className="block font-medium">{item.label}</span>
              <span className="tabular-nums">
                {tableCounts[item.key] === null
                  ? "нет таблицы"
                  : tableCounts[item.key]!.toLocaleString("ru-RU")}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={adminClass.panel}>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Поиск</h2>
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Таблица</span>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as DbModelKey)}
              className={adminClass.input}
            >
              {models.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Поле</span>
            <select
              value={field}
              onChange={(event) => setField(event.target.value)}
              className={adminClass.input}
            >
              <option value="">— без фильтра —</option>
              {searchableFields.map(([key, def]) => (
                <option key={key} value={key}>
                  {def.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Значение</span>
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={field ? "Введите значение…" : "Показать последние записи"}
              className={adminClass.input}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Режим</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as DbSearchMode)}
              disabled={selectedFieldType !== "string"}
              className={`${adminClass.input} disabled:opacity-50`}
            >
              <option value="contains">Содержит</option>
              <option value="exact">Точно</option>
            </select>
          </label>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={loading} className={adminClass.btnPrimary}>
              {loading ? "Загрузка…" : "Найти"}
            </button>
            <button
              type="button"
              disabled={loading}
              className={adminClass.btnSecondary}
              onClick={() => {
                setValue("");
                setField("");
                void fetchResults({
                  modelKey: model,
                  searchField: "",
                  searchValue: "",
                  searchMode: mode,
                  nextPage: 1,
                });
              }}
            >
              Сбросить
            </button>
          </div>
        </form>

        {error ? <p className={`mt-4 ${adminClass.alertError}`}>{error}</p> : null}
      </section>

      {result ? (
        <section className={`${adminClass.panel} !p-0`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{result.modelLabel}</h2>
              <p className="text-sm text-muted">
                Найдено: {result.total.toLocaleString("ru-RU")} · страница {result.page} из{" "}
                {result.totalPages}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || result.page <= 1}
                className={adminClass.btnSecondary}
                onClick={() =>
                  void fetchResults({
                    modelKey: model,
                    searchField: field,
                    searchValue: value,
                    searchMode: mode,
                    nextPage: result.page - 1,
                  })
                }
              >
                ← Назад
              </button>
              <button
                type="button"
                disabled={loading || result.page >= result.totalPages}
                className={adminClass.btnSecondary}
                onClick={() =>
                  void fetchResults({
                    modelKey: model,
                    searchField: field,
                    searchValue: value,
                    searchMode: mode,
                    nextPage: result.page + 1,
                  })
                }
              >
                Вперёд →
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={adminClass.tableHead}>
                <tr>
                  {result.columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-3 py-2">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={result.columns.length} className="px-3 py-6 text-center text-muted">
                      Ничего не найдено
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, index) => (
                    <tr key={index} className={adminClass.tableRow}>
                      {result.columns.map((column) => (
                        <td
                          key={column}
                          className="max-w-xs truncate px-3 py-2 text-muted"
                          title={formatCell(row[column])}
                        >
                          {formatCell(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
