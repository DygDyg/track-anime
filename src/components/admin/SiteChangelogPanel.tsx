"use client";

import { useMemo, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type {
  SiteChangelogEntry,
  SiteChangelogItemKind,
} from "@/lib/site-changelog-types";

const KIND_LABEL: Record<SiteChangelogItemKind, string> = {
  feature: "Новое",
  improvement: "Улучшение",
  change: "Изменение",
  fix: "Исправление",
};

const KIND_BADGE: Record<SiteChangelogItemKind, string> = {
  feature: adminClass.badgeDone,
  improvement: adminClass.badgeRunning,
  change: adminClass.badgeIdle,
  fix: adminClass.badgeError,
};

const ADMIN_MARK_CLASS =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-md bg-violet-500/20 text-[11px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/40";

/** Demo payload so empty file still shows public + admin-only items. */
const DEMO_ENTRIES: SiteChangelogEntry[] = [
  {
    id: "2026-10-11",
    recordedAt: "2026-10-11T10:15:00.000Z",
    gitSha: "demo01",
    buildNumber: 128,
    title: "Главная и плеер",
    items: [
      {
        kind: "feature",
        text: "На главной появился блок «Новинки» со стартовавшими сезонами.",
      },
      {
        kind: "improvement",
        text: "В TA Plus быстрее подгружаются превью при перемотке.",
      },
      {
        kind: "fix",
        text: "Исправлено зависание картинки при смене серии в TA Plus.",
      },
      {
        kind: "fix",
        audience: "admin",
        text: "В админке починен фильтр списка pending Kodik-материалов.",
      },
    ],
  },
  {
    id: "2026-10-05",
    recordedAt: "2026-10-05T18:40:00.000Z",
    gitSha: "demo02",
    buildNumber: 120,
    title: "Уведомления",
    items: [
      {
        kind: "change",
        text: "Пуш о новых сериях учитывает прогресс просмотра точнее.",
      },
      {
        kind: "improvement",
        text: "В настройках уведомлений понятнее подписи каналов.",
      },
    ],
  },
];

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ChangelogEntryCard({ entry }: { entry: SiteChangelogEntry }) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {entry.title?.trim() || "Обновление сайта"}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{formatWhen(entry.recordedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {entry.buildNumber != null ? <span>сборка #{entry.buildNumber}</span> : null}
          {entry.gitSha ? (
            <span className={adminClass.code}>{entry.gitSha}</span>
          ) : null}
        </div>
      </header>
      <ul className="space-y-2">
        {entry.items.map((item, index) => (
          <li key={`${entry.id}-${index}`} className="flex gap-2 text-sm text-foreground">
            <span
              className={`${KIND_BADGE[item.kind]} w-[7.25rem] shrink-0 justify-center self-start text-center`}
            >
              {KIND_LABEL[item.kind]}
            </span>
            {item.audience === "admin" ? (
              <span className={ADMIN_MARK_CLASS} title="Только для админа" aria-label="Только для админа">
                A
              </span>
            ) : null}
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function SiteChangelogPanel({
  initialEntries,
}: {
  initialEntries: SiteChangelogEntry[];
}) {
  const [mode, setMode] = useState<"live" | "demo">(
    initialEntries.length > 0 ? "live" : "demo",
  );

  const entries = useMemo(
    () => (mode === "demo" ? DEMO_ENTRIES : initialEntries),
    [mode, initialEntries],
  );

  return (
    <div className="space-y-6">
      <section className={`${adminClass.panel} space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Changelog для пользователей
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Превью блока «Что нового». Значок A — только для админов, на сайте не
              показывается.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={mode === "live" ? adminClass.btnSmOn : adminClass.btnSmOff}
              onClick={() => setMode("live")}
            >
              Файл ({initialEntries.length})
            </button>
            <button
              type="button"
              className={mode === "demo" ? adminClass.btnSmOn : adminClass.btnSmOff}
              onClick={() => setMode("demo")}
            >
              Пример превью
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(Object.keys(KIND_LABEL) as SiteChangelogItemKind[]).map((kind) => (
            <span key={kind} className={KIND_BADGE[kind]}>
              {KIND_LABEL[kind]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className={ADMIN_MARK_CLASS} title="Только для админа" aria-hidden>
              A
            </span>
            только для админа (не показывается пользователям)
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {mode === "demo" ? "Пример превью" : "Записи"}
          </h3>
          {mode === "demo" ? (
            <p className="text-xs text-muted">Демо, не из файла</p>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted">
            Пока записей нет. Можно открыть пример превью.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <ChangelogEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
