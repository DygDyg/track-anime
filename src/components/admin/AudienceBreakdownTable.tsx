"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { adminClass } from "@/components/admin/admin-styles";

export type SortDir = "asc" | "desc";

export function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`py-2 pr-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${
          active ? "text-foreground" : "text-muted"
        }`}
      >
        <span>{label}</span>
        <span className="text-[10px] tabular-nums opacity-80" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function useAdminTableSort<K extends string>(defaultKey: K, defaultDir: SortDir = "desc") {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function toggle(key: K) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === defaultKey ? defaultDir : "asc");
  }

  return { sortKey, sortDir, toggle };
}

function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;
  return String(a).localeCompare(String(b), "ru") * mul;
}

export function AudienceBreakdownTable({
  title,
  rows,
  countLabel = "Кол-во",
}: {
  title: string;
  rows: { label: string; count: number }[];
  countLabel?: string;
}) {
  const { sortKey, sortDir, toggle } = useAdminTableSort<"label" | "count">("count", "desc");
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) =>
      compareValues(
        sortKey === "label" ? a.label : a.count,
        sortKey === "label" ? b.label : b.count,
        sortDir,
      ),
    );
  }, [rows, sortKey, sortDir]);

  return (
    <div className={adminClass.panel}>
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Пока нет данных.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={adminClass.tableHead}>
                <SortableTh
                  label="Название"
                  active={sortKey === "label"}
                  dir={sortDir}
                  onClick={() => toggle("label")}
                />
                <SortableTh
                  label={countLabel}
                  active={sortKey === "count"}
                  dir={sortDir}
                  onClick={() => toggle("count")}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.label} className={adminClass.tableRow}>
                  <td className="py-2 pr-3 text-foreground">{row.label}</td>
                  <td className="py-2 tabular-nums text-foreground">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AudienceSectionTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; hits: number; uniques: number }[];
}) {
  const { sortKey, sortDir, toggle } = useAdminTableSort<"label" | "hits" | "uniques">("hits", "desc");
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = sortKey === "label" ? a.label : sortKey === "hits" ? a.hits : a.uniques;
      const bv = sortKey === "label" ? b.label : sortKey === "hits" ? b.hits : b.uniques;
      return compareValues(av, bv, sortDir);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className={adminClass.panel}>
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Пока нет данных.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={adminClass.tableHead}>
                <SortableTh
                  label="Раздел"
                  active={sortKey === "label"}
                  dir={sortDir}
                  onClick={() => toggle("label")}
                />
                <SortableTh
                  label="Хиты"
                  active={sortKey === "hits"}
                  dir={sortDir}
                  onClick={() => toggle("hits")}
                />
                <SortableTh
                  label="Уник."
                  active={sortKey === "uniques"}
                  dir={sortDir}
                  onClick={() => toggle("uniques")}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.label} className={adminClass.tableRow}>
                  <td className="py-2 pr-3 text-foreground">{row.label}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.hits}</td>
                  <td className="py-2 tabular-nums">{row.uniques}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AudienceTitlesTable({
  title,
  hint,
  rows,
}: {
  title: string;
  hint?: string;
  rows: { shikimoriId: number; title: string; hits: number; uniques: number }[];
}) {
  const { sortKey, sortDir, toggle } = useAdminTableSort<"title" | "hits" | "uniques">("hits", "desc");
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = sortKey === "title" ? a.title : sortKey === "hits" ? a.hits : a.uniques;
      const bv = sortKey === "title" ? b.title : sortKey === "hits" ? b.hits : b.uniques;
      return compareValues(av, bv, sortDir);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className={adminClass.panel}>
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="mb-3 text-xs text-muted">{hint}</p> : <div className="mb-3" />}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Пока нет данных.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={adminClass.tableHead}>
                <SortableTh
                  label="Тайтл"
                  active={sortKey === "title"}
                  dir={sortDir}
                  onClick={() => toggle("title")}
                />
                <SortableTh
                  label="Хиты"
                  active={sortKey === "hits"}
                  dir={sortDir}
                  onClick={() => toggle("hits")}
                />
                <SortableTh
                  label="Уник."
                  active={sortKey === "uniques"}
                  dir={sortDir}
                  onClick={() => toggle("uniques")}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.shikimoriId} className={adminClass.tableRow}>
                  <td className="py-2 pr-3">
                    <Link href={`/anime/${row.shikimoriId}`} className={adminClass.textLink}>
                      {row.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.hits}</td>
                  <td className="py-2 tabular-nums">{row.uniques}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
