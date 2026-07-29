"use client";

import { useEffect, useMemo, useState } from "react";
import { TranslationBadge } from "@/components/TranslationBadge";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  BETA_HIDDEN_PROGRESS_OPACITY_MAX,
  BETA_HIDDEN_PROGRESS_OPACITY_MIN,
  BETA_HIDDEN_PROGRESS_OPACITY_STEP,
  type SiteSettings,
} from "@/lib/site-settings";
import {
  TRANSLATION_INTRO_OFFSET_MAX_SEC,
  TRANSLATION_INTRO_OFFSET_MIN_SEC,
  TRANSLATION_INTRO_OFFSET_STEP_SEC,
} from "@/lib/translation-intro-offset";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>;
}

type Props = {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
  updateLocalSettings: (patch: Partial<SiteSettings>) => void;
};

export function PlayerSettingsTab({ settings, updateSettings, updateLocalSettings }: Props) {
  const { remoteSaving } = useSiteSettings();
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/settings/translations");
        if (!res.ok) throw new Error("load failed");
        const data: { names: string[] } = await res.json();
        if (!cancelled) setNames(data.names);
      } catch {
        if (!cancelled) setNames([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredNames = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names;
    return names.filter((name) => name.toLowerCase().includes(q));
  }, [names, query]);

  const configuredCount = useMemo(
    () => Object.values(settings.translationIntroOffsets).filter((value) => value > 0).length,
    [settings.translationIntroOffsets],
  );

  const setOffset = (name: string, seconds: number) => {
    const next = { ...settings.translationIntroOffsets };
    if (seconds <= 0) {
      delete next[name];
    } else {
      next[name] = seconds;
    }
    updateSettings({ translationIntroOffsets: next });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <SectionTitle>TA-плеер</SectionTitle>
            <SectionHint>
              Основной плеер сайта с собственной панелью управления, выбором серий и функциями TA.
              Включите Kodik только если нужен его оригинальный интерфейс.
            </SectionHint>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={settings.useLegacyKodikPlayer}
              onChange={(event) => updateSettings({ useLegacyKodikPlayer: event.target.checked })}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Kodik
          </label>
        </div>
        <p className="text-xs leading-relaxed text-amber-200/90">
          Kodik — оригинальный legacy-плеер. Некоторые функции сайта могут не работать в нём.
        </p>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <SectionTitle>ТВ-режим управления</SectionTitle>
            <SectionHint>
              Локально для этого устройства. Когда выключено, стрелки не переключают фокус по
              карточкам сайта.
            </SectionHint>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={settings.tvNavigationEnabled}
              onChange={(event) =>
                updateLocalSettings({ tvNavigationEnabled: event.target.checked })
              }
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Включить
          </label>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <SectionTitle>Динамическое изменение ширины панели управления</SectionTitle>
            <SectionHint>
              Раздвигать нижнюю панель TA-плеера при наведении на зону качества Kodik. Если
              выключено — панель всегда раздвинута, и качество Kodik доступно без наведения.
            </SectionHint>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={settings.playerControlsDynamicWidth}
              onChange={(event) =>
                updateSettings({ playerControlsDynamicWidth: event.target.checked })
              }
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Включить
          </label>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionTitle>Полоса прогресса при скрытом интерфейсе</SectionTitle>
            <SectionHint>
              Видимость тонкой полосы внизу TA-плеера, когда панель управления исчезает.
              0% — выключить.
            </SectionHint>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
            {Math.round(settings.betaHiddenProgressOpacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={BETA_HIDDEN_PROGRESS_OPACITY_MIN}
          max={BETA_HIDDEN_PROGRESS_OPACITY_MAX}
          step={BETA_HIDDEN_PROGRESS_OPACITY_STEP}
          value={settings.betaHiddenProgressOpacity}
          onChange={(event) =>
            updateSettings({ betaHiddenProgressOpacity: Number(event.target.value) })
          }
          className="site-range w-full"
        />
      </section>

      <section className="space-y-2">
        <SectionTitle>Пропуск интро по озвучкам</SectionTitle>
        <SectionHint>
          При смене озвучки позиция сдвигается на разницу смещений; в начале серии плеер перейдёт
          минимум на указанную секунду, чтобы пропустить заставку. 0 — без смещения. Настроено:{" "}
          {configuredCount}.
        </SectionHint>
      </section>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск озвучки…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/40 placeholder:text-muted focus:ring-2"
      />

      {loading ? (
        <p className="text-sm text-muted">Загрузка списка озвучек…</p>
      ) : names.length === 0 ? (
        <p className="text-sm text-muted">Список озвучек пока пуст.</p>
      ) : (
        <ul className="max-h-[min(52dvh,28rem)] space-y-2 overflow-y-auto rounded-lg border border-border bg-background/60 p-2">
          {filteredNames.map((name) => {
            const value = settings.translationIntroOffsets[name] ?? 0;
            return (
              <li
                key={name}
                className="rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <TranslationBadge name={name} className="min-w-0 max-w-full" />
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                    {value} сек
                  </span>
                </div>
                <input
                  type="range"
                  min={TRANSLATION_INTRO_OFFSET_MIN_SEC}
                  max={TRANSLATION_INTRO_OFFSET_MAX_SEC}
                  step={TRANSLATION_INTRO_OFFSET_STEP_SEC}
                  value={value}
                  onChange={(event) => setOffset(name, Number(event.target.value))}
                  className="site-range w-full"
                />
              </li>
            );
          })}
          {filteredNames.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted">Ничего не найдено</li>
          ) : null}
        </ul>
      )}
      {remoteSaving ? <p className="text-xs text-muted">Сохраняем настройки…</p> : null}

    </div>
  );
}
