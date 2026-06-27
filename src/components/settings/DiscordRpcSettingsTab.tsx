"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { pingDiscordBridge } from "@/lib/discord-presence";
import { useDiscordConfig } from "@/hooks/useDiscordConfig";
import type { SiteSettings } from "@/lib/site-settings";

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
        disabled ? "cursor-not-allowed opacity-60" : "",
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

export function DiscordRpcSettingsTab({
  settings,
  updateSettings,
}: {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
}) {
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const { configured, loading, bridgeDownloadUrl } = useDiscordConfig();

  const checkBridge = useCallback(async () => {
    setBridgeOnline(await pingDiscordBridge());
  }, []);

  useEffect(() => {
    if (!configured) return;
    void checkBridge();
  }, [checkBridge, configured, settings.discordPresenceEnabled]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Discord Rich Presence</h3>
        <p className="text-xs leading-relaxed text-muted">
          Показывает в Discord, что вы смотрите на Track Anime. Нужны Discord desktop и локальный мост
          на вашем ПК.
        </p>

        {!loading && !configured ? (
          <p className="rounded-lg border border-border bg-surface-dim px-3 py-2 text-xs text-muted">
            Application ID Discord не задан — добавьте его в{" "}
            <Link href="/admin/discord" className="text-accent hover:underline">
              админ-панели
            </Link>
            .
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Локальный мост</h3>
        <p className="text-xs text-muted">
          Скачайте и запустите приложение — в трее появится иконка, через неё можно открыть консоль,
          включить автозапуск и выйти.
        </p>

        {bridgeDownloadUrl ? (
          <a
            href={bridgeDownloadUrl}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/15"
          >
            Скачать TrackAnimeDiscordRPC.exe
          </a>
        ) : (
          <p className="rounded-lg border border-border bg-surface-dim px-3 py-2 text-xs text-muted">
            Ссылка на скачивание не настроена. Админ может указать её в{" "}
            <Link href="/admin/discord" className="text-accent hover:underline">
              /admin/discord
            </Link>
            .
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            Статус моста:{" "}
            {bridgeOnline == null ? "проверка…" : bridgeOnline ? "подключён" : "не найден"}
          </span>
          <button
            type="button"
            onClick={() => void checkBridge()}
            className="rounded-md border border-border px-2 py-1 transition hover:border-accent/40 hover:text-foreground"
          >
            Проверить
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Отображение</h3>

        <ToggleRow
          label="Показывать просмотр в Discord"
          hint="Название аниме, серия и таймер просмотра"
          checked={settings.discordPresenceEnabled}
          disabled={!configured}
          onChange={(checked) => updateSettings({ discordPresenceEnabled: checked })}
        />

        <ToggleRow
          label="Показывать раздел сайта"
          hint="На главной, в календаре, истории и других разделах — «На сайте: Календарь»"
          checked={settings.discordPresenceShowSitePage}
          disabled={!configured || !settings.discordPresenceEnabled}
          onChange={(checked) => updateSettings({ discordPresenceShowSitePage: checked })}
        />

        <ToggleRow
          label="Кнопка «Открыть» в Discord"
          hint="Ссылка на текущую страницу или просмотр аниме"
          checked={settings.discordPresenceOpenButtonEnabled}
          disabled={!configured || !settings.discordPresenceEnabled}
          onChange={(checked) => updateSettings({ discordPresenceOpenButtonEnabled: checked })}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface-dim px-3 py-2 text-xs leading-relaxed text-muted">
        <p>На скрытой вкладке браузера RPC не обновляется — управляет только видимая вкладка.</p>
        <p className="mt-2">
          Таймер в Discord синхронизируется с позицией в плеере (сколько уже просмотрено в серии).
        </p>
        <p className="mt-2">
          При включении автозапуска программа копируется в{" "}
          <code className="text-foreground/90">%AppData%\Track Anime Discord RPC\</code> — перенос exe
          не ломает автозагрузку.
        </p>
      </section>
    </div>
  );
}
