"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import {
  SiteSettingsAppearanceTab,
  SiteSettingsDiscordTab,
  SiteSettingsHomeTab,
} from "@/components/settings/SiteSettingsModal";
import {
  DEFAULT_SITE_SETTINGS,
  buildPopularHomeTranslationFilter,
  normalizeSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";
import type { SiteSettingsDefaultsDto } from "@/lib/admin/site-settings-defaults";

type TabId = "appearance" | "home" | "discord";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Главная" },
  { id: "appearance", label: "Внешний вид" },
  { id: "discord", label: "Discord RPC" },
];

function buildSelectionFilter(
  value: string,
  enabled: boolean,
  current: string[] | null,
  allValues: string[],
): string[] | null {
  const total = allValues.length;
  if (total === 0) return null;

  const currentSet =
    current === null ? new Set(allValues) : new Set(current.filter((item) => allValues.includes(item)));

  if (enabled) {
    currentSet.add(value);
  } else {
    currentSet.delete(value);
  }

  if (currentSet.size >= total) return null;
  if (currentSet.size === 0) return [];
  return allValues.filter((item) => currentSet.has(item));
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function AdminSiteSettingsDefaultsPanel({
  initialData,
}: {
  initialData: SiteSettingsDefaultsDto;
}) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<TabId>("appearance");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const settings = data.settings;

  const updateSettings = useCallback((patch: Partial<SiteSettings>) => {
    setData((current) => ({
      ...current,
      settings: normalizeSiteSettings({ ...current.settings, ...patch }),
    }));
    setMessage(null);
  }, []);

  const toggleTranslationOnHome = useCallback(
    (name: string, enabled: boolean, allNames: string[]) => {
      setData((current) => {
        const nextFilter = buildSelectionFilter(
          name,
          enabled,
          current.settings.homeTranslationFilter,
          allNames,
        );
        return {
          ...current,
          settings: normalizeSiteSettings({
            ...current.settings,
            homeTranslationFilter: nextFilter,
          }),
        };
      });
      setMessage(null);
    },
    [],
  );

  const setAllHomeTranslations = useCallback((enabled: boolean) => {
    setData((current) => ({
      ...current,
      settings: normalizeSiteSettings({
        ...current.settings,
        homeTranslationFilter: enabled ? null : [],
      }),
    }));
    setMessage(null);
  }, []);

  const setPopularHomeTranslations = useCallback((allNames: string[]) => {
    setData((current) => ({
      ...current,
      settings: normalizeSiteSettings({
        ...current.settings,
        homeTranslationFilter: buildPopularHomeTranslationFilter(allNames),
      }),
    }));
    setMessage(null);
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/site-settings-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const body = (await res.json()) as SiteSettingsDefaultsDto & { error?: string };

      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? "Не удалось сохранить" });
        return;
      }

      setData(body);
      setMessage({ ok: true, text: "Настройки по умолчанию сохранены" });
    } catch {
      setMessage({ ok: false, text: "Не удалось сохранить" });
    } finally {
      setSaving(false);
    }
  }

  function resetToFactory() {
    setData((current) => ({
      ...current,
      settings: { ...DEFAULT_SITE_SETTINGS },
    }));
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Настройки сайта по умолчанию</h2>
        <p className="mt-1 text-sm text-muted">
          Эти значения получают новые посетители без своих сохранённых настроек. Кнопка «Сбросить всё» в
          пользовательском меню тоже возвращает к этим значениям. Тема (светлая/тёмная) хранится отдельно и
          здесь не задаётся.
        </p>
        <p className="mt-2 text-xs text-muted">
          Последнее изменение: {formatDateTime(data.updatedAt)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              tab === item.id
                ? "bg-accent/10 text-accent"
                : "border border-border text-muted hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={`${adminClass.panel} p-4 sm:p-5`}>
        {tab === "appearance" ? (
          <SiteSettingsAppearanceTab
            settings={settings}
            updateSettings={updateSettings}
            hideTheme
          />
        ) : null}
        {tab === "home" ? (
          <SiteSettingsHomeTab
            settings={settings}
            updateSettings={updateSettings}
            toggleTranslationOnHome={toggleTranslationOnHome}
            setAllHomeTranslations={setAllHomeTranslations}
            setPopularHomeTranslations={setPopularHomeTranslations}
          />
        ) : null}
        {tab === "discord" ? (
          <SiteSettingsDiscordTab settings={settings} updateSettings={updateSettings} />
        ) : null}
      </div>

      {message ? (
        <p className={message.ok ? "text-sm text-emerald-400" : "text-sm text-red-400"}>{message.text}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={adminClass.btnPrimary}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button type="button" onClick={resetToFactory} className={adminClass.btnSecondary}>
          Заводские значения из кода
        </button>
      </div>
    </div>
  );
}
