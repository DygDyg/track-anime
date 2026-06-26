"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TranslationBadge } from "@/components/TranslationBadge";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { useThemeContext } from "@/components/ThemeProvider";
import {
  SITE_ACCENT_OPTIONS,
  SITE_BG_DIM_OPTIONS,
  SITE_CARD_SIZE_OPTIONS,
  SITE_CURSOR_OPTIONS,
  SITE_FONT_OPTIONS,
  homeTranslationFilterSummary,
  HOVER_TRAILER_DELAY_MAX_SEC,
  HOVER_TRAILER_DELAY_MIN_SEC,
  type SiteSettings,
} from "@/lib/site-settings";
import type { AdminTodoDto } from "@/lib/admin/todos";
import type { Theme } from "@/lib/theme";

type TabId = "appearance" | "home" | "future";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Главная" },
  { id: "appearance", label: "Внешний вид" },
  { id: "future", label: "Идеи" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>;
}

function OptionButton({
  active,
  label,
  hint,
  onClick,
  swatch,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border px-3 py-2 text-left text-sm transition",
        active
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border bg-card text-muted hover:border-accent/40 hover:text-foreground",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        {swatch ? (
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
            style={{ backgroundColor: swatch }}
          />
        ) : null}
        <span className="font-medium">{label}</span>
      </span>
      {hint ? <span className="mt-0.5 block text-xs opacity-80">{hint}</span> : null}
    </button>
  );
}

function RangeRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-border bg-card px-3 py-2.5",
        disabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
          {value} {unit}
        </span>
      </div>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="site-range mt-3 w-full"
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
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

function ThemeSection() {
  const { theme, setTheme } = useThemeContext();

  const set = (next: Theme) => setTheme(next);

  return (
    <section className="space-y-3">
      <SectionTitle>Тема</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <OptionButton active={theme === "dark"} label="Тёмная" onClick={() => set("dark")} />
        <OptionButton active={theme === "light"} label="Светлая" onClick={() => set("light")} />
      </div>
    </section>
  );
}

function AppearanceTab({
  settings,
  updateSettings,
}: {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
}) {
  return (
    <div className="space-y-6">
      <ThemeSection />

      <section className="space-y-3">
        <SectionTitle>Шрифт</SectionTitle>
        <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {SITE_FONT_OPTIONS.map((option) => (
            <OptionButton
              key={option.id}
              active={settings.fontFamily === option.id}
              label={option.label}
              onClick={() => updateSettings({ fontFamily: option.id })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Курсор</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          {SITE_CURSOR_OPTIONS.map((option) => (
            <OptionButton
              key={option.id}
              active={settings.cursorStyle === option.id}
              label={option.label}
              onClick={() => updateSettings({ cursorStyle: option.id })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Размер карточек</SectionTitle>
        <div className="grid gap-2">
          {SITE_CARD_SIZE_OPTIONS.map((option) => (
            <OptionButton
              key={option.id}
              active={settings.cardSize === option.id}
              label={option.label}
              hint={option.hint}
              onClick={() => updateSettings({ cardSize: option.id })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Цвет акцента</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {SITE_ACCENT_OPTIONS.map((option) => (
            <OptionButton
              key={option.id}
              active={settings.accentPreset === option.id}
              label={option.label}
              swatch={option.swatch}
              onClick={() => updateSettings({ accentPreset: option.id })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Затемнение фона</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {SITE_BG_DIM_OPTIONS.map((option) => (
            <OptionButton
              key={option.id}
              active={settings.backgroundDim === option.id}
              label={option.label}
              onClick={() => updateSettings({ backgroundDim: option.id })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <ToggleRow
          label="Уменьшить анимации"
          hint="Отключает плавные переходы и декоративные анимации"
          checked={settings.reduceMotion}
          onChange={(checked) => updateSettings({ reduceMotion: checked })}
        />
      </section>
    </div>
  );
}

function HomeTab({
  settings,
  updateSettings,
  toggleTranslationOnHome,
  setAllHomeTranslations,
  setPopularHomeTranslations,
}: {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
  toggleTranslationOnHome: (name: string, enabled: boolean, allNames: string[]) => void;
  setAllHomeTranslations: (enabled: boolean, allNames: string[]) => void;
  setPopularHomeTranslations: (allNames: string[]) => void;
}) {
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

  const isTranslationEnabled = (name: string) => {
    if (settings.homeTranslationFilter === null) return true;
    return settings.homeTranslationFilter.includes(name);
  };

  const allEnabled =
    settings.homeTranslationFilter === null ||
    (names.length > 0 && names.every((name) => settings.homeTranslationFilter!.includes(name)));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <SectionTitle>Блок «Новое в вашей истории»</SectionTitle>
        <SectionHint>Тайтлы из истории просмотра с новыми сериями — над основной лентой.</SectionHint>
        <ToggleRow
          label="По умолчанию свёрнутый"
          hint="При открытии главной блок истории будет свёрнут, пока вы его не развернёте"
          checked={settings.homeHistoryCollapsedByDefault}
          onChange={(checked) => updateSettings({ homeHistoryCollapsedByDefault: checked })}
        />
      </section>

      <section className="space-y-2">
        <SectionTitle>Карточки на главной</SectionTitle>
        <SectionHint>Настройки ниже влияют только на ленту новых серий.</SectionHint>
        <ToggleRow
          label="Постеры вместо скриншотов"
          hint="Если у серии есть скриншот, показывать постер аниме"
          checked={settings.preferPosterOverScreenshot}
          onChange={(checked) => updateSettings({ preferPosterOverScreenshot: checked })}
        />
        <ToggleRow
          label="Относительное время"
          hint="«2 часа назад» вместо точной даты на карточках"
          checked={settings.showRelativeTime}
          onChange={(checked) => updateSettings({ showRelativeTime: checked })}
        />
        <ToggleRow
          label="Трейлер при наведении"
          hint="YouTube-трейлер в hover-карточке, если он есть на Shikimori"
          checked={settings.hoverTrailerEnabled}
          onChange={(checked) => updateSettings({ hoverTrailerEnabled: checked })}
        />
        <RangeRow
          label="Задержка перед трейлером"
          hint="Сколько секунд держать курсор на карточке до запуска видео"
          value={settings.hoverTrailerDelaySec}
          min={HOVER_TRAILER_DELAY_MIN_SEC}
          max={HOVER_TRAILER_DELAY_MAX_SEC}
          step={1}
          unit="сек"
          disabled={!settings.hoverTrailerEnabled}
          onChange={(value) => updateSettings({ hoverTrailerDelaySec: value })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionTitle>Озвучки на главной</SectionTitle>
            <SectionHint>{homeTranslationFilterSummary(settings.homeTranslationFilter, names.length)}</SectionHint>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAllHomeTranslations(true, names)}
              disabled={loading || names.length === 0 || allEnabled}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setPopularHomeTranslations(names)}
              disabled={loading || names.length === 0}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Популярные
            </button>
            <button
              type="button"
              onClick={() => setAllHomeTranslations(false, names)}
              disabled={
                loading ||
                names.length === 0 ||
                (settings.homeTranslationFilter !== null && settings.homeTranslationFilter.length === 0)
              }
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Снять все
            </button>
          </div>
        </div>

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
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-background/60 p-2">
            {filteredNames.map((name) => {
              const enabled = isTranslationEnabled(name);
              return (
                <li key={name}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-foreground/5">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => toggleTranslationOnHome(name, event.target.checked, names)}
                      className="site-checkbox"
                    />
                    <TranslationBadge name={name} className="min-w-0 max-w-[calc(100%-1.5rem)]" />
                  </label>
                </li>
              );
            })}
            {filteredNames.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted">Ничего не найдено</li>
            ) : null}
          </ul>
        )}

        {!allEnabled && settings.homeTranslationFilter !== null && settings.homeTranslationFilter.length === 0 ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Ни одна озвучка не выбрана — лента на главной будет пустой, пока вы не отметите хотя бы одну.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function FutureTab() {
  const [items, setItems] = useState<AdminTodoDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/admin/todos");
        if (!res.ok) throw new Error("load_failed");
        const data: { items: AdminTodoDto[] } = await res.json();
        if (!cancelled) {
          setItems(data.items.filter((item) => item.status !== "done").slice(0, 8));
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <SectionTitle>План разработки</SectionTitle>
      <SectionHint>
        Полный список задач с приоритетами — в{" "}
        <Link href="/admin/todo" className="text-accent hover:underline">
          админке → To-do
        </Link>
        . Новые идеи присылайте в чат.
      </SectionHint>

      {loading ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Активных задач нет.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="mt-1 block text-xs text-muted">
                приоритет {item.score} · важн. {item.importance} · сложн. {item.complexity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SiteSettingsModal() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const {
    settings,
    updateSettings,
    resetSettings,
    settingsOpen,
    closeSettings,
    toggleTranslationOnHome,
    setAllHomeTranslations,
    setPopularHomeTranslations,
  } = useSiteSettings();
  const [tab, setTab] = useState<TabId>("home");
  const [mounted, setMounted] = useState(false);

  const visibleTabs = useMemo(
    () => TABS.filter((item) => item.id !== "future" || isAdmin),
    [isAdmin],
  );

  useEffect(() => {
    if (tab === "future" && !isAdmin) {
      setTab("home");
    }
  }, [tab, isAdmin]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettings();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen, closeSettings]);

  if (!mounted || !settingsOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Закрыть настройки"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={closeSettings}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-settings-title"
        className="relative flex max-h-[min(92dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl shadow-black/40 sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id="site-settings-title" className="text-lg font-semibold text-foreground">
              Настройки сайта
            </h2>
            <p className="mt-1 text-sm text-muted">Кастомизация внешнего вида и ленты на главной</p>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-lg p-2 text-muted transition hover:bg-foreground/5 hover:text-foreground"
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r sm:px-2 sm:py-4">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={[
                  "shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                  tab === item.id
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-foreground/5 hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            {tab === "appearance" ? (
              <AppearanceTab settings={settings} updateSettings={updateSettings} />
            ) : null}
            {tab === "home" ? (
              <HomeTab
                settings={settings}
                updateSettings={updateSettings}
                toggleTranslationOnHome={toggleTranslationOnHome}
                setAllHomeTranslations={setAllHomeTranslations}
                setPopularHomeTranslations={setPopularHomeTranslations}
              />
            ) : null}
            {tab === "future" && isAdmin ? <FutureTab /> : null}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={resetSettings}
            className="text-sm text-muted transition hover:text-foreground"
          >
            Сбросить всё
          </button>
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            Готово
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
