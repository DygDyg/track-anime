"use client";

import { useEffect, useState } from "react";
import {
  fetchCompletedSiteChangelog,
  SiteChangelogEntriesStack,
} from "@/components/SiteChangelogEntries";
import type { SiteChangelogEntry } from "@/lib/site-changelog-types";
import type { SiteSettings } from "@/lib/site-settings";

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="site-checkbox mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

type Props = {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
};

export function ChangelogSettingsTab({ settings, updateSettings }: Props) {
  const [entries, setEntries] = useState<SiteChangelogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchCompletedSiteChangelog();
        if (!cancelled) {
          setEntries(list);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
          setError("Не удалось загрузить список обновлений");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Окно нововведений</h3>
        <p className="text-xs leading-relaxed text-muted">
          Показывается один раз после завершения суток, в которые были заметные изменения сайта.
          Сегодняшний день ещё собирается и в списке не участвует.
        </p>
        <ToggleRow
          label="Показывать нововведения"
          hint="Автоматически открывать окно «Что нового» при входе"
          checked={settings.showWhatsNewChangelog}
          onChange={(checked) => updateSettings({ showWhatsNewChangelog: checked })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Завершённые обновления</h3>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        {entries == null ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : (
          <SiteChangelogEntriesStack entries={entries} />
        )}
      </section>
    </div>
  );
}
