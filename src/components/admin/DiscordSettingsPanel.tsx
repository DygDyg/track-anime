"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { DiscordSettingsDto } from "@/lib/discord-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function DiscordSettingsPanel({
  initialSettings,
}: {
  initialSettings: DiscordSettingsDto;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [applicationIdInput, setApplicationIdInput] = useState(initialSettings.applicationId ?? "");
  const [largeImageKeyInput, setLargeImageKeyInput] = useState(initialSettings.largeImageKey);
  const [bridgeDownloadUrlInput, setBridgeDownloadUrlInput] = useState(
    initialSettings.bridgeDownloadUrl ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/discord/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { settings: DiscordSettingsDto };
      setSettings(data.settings);
      setApplicationIdInput(data.settings.applicationId ?? "");
      setLargeImageKeyInput(data.settings.largeImageKey);
      setBridgeDownloadUrlInput(data.settings.bridgeDownloadUrl ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  async function save() {
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/discord/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: applicationIdInput.trim() || null,
          largeImageKey: largeImageKeyInput.trim(),
          bridgeDownloadUrl: bridgeDownloadUrlInput.trim() || null,
        }),
      });
      const data = (await res.json()) as { settings?: DiscordSettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setApplicationIdInput(data.settings.applicationId ?? "");
        setLargeImageKeyInput(data.settings.largeImageKey);
      }
      setSaveMessage({ ok: true, text: "Настройки Discord сохранены" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  async function clearApplicationId() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/discord/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: null }),
      });
      const data = (await res.json()) as { settings?: DiscordSettingsDto; error?: string };
      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось очистить" });
        return;
      }
      if (data.settings) {
        setSettings(data.settings);
        setApplicationIdInput("");
        setLargeImageKeyInput(data.settings.largeImageKey);
      }
      setSaveMessage({ ok: true, text: "Application ID очищен" });
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Discord Rich Presence</h2>
        <p className="mt-2 text-sm text-muted">
          Application ID из{" "}
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noopener noreferrer"
            className={adminClass.link}
          >
            Discord Developer Portal
          </a>
          . Используется для Rich Presence при просмотре через локальный мост{" "}
          <code className="text-xs">TrackAnimeDiscordRPC.exe</code> или{" "}
          <code className="text-xs">npm run discord:tray</code>.
        </p>
      </section>

      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Application ID</h2>

        <label className="mt-4 block text-sm">
          <span className="text-muted">ID приложения Discord</span>
          <input
            type="text"
            inputMode="numeric"
            className="mt-1 w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm text-foreground"
            value={applicationIdInput}
            disabled={saving}
            placeholder="1234567890123456789"
            onChange={(event) => setApplicationIdInput(event.target.value)}
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-muted">Ключ large image в Art Assets</span>
          <input
            type="text"
            className="mt-1 w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm text-foreground"
            value={largeImageKeyInput}
            disabled={saving}
            placeholder="logo"
            onChange={(event) => setLargeImageKeyInput(event.target.value)}
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-muted">Ссылка на скачивание моста (exe)</span>
          <input
            type="url"
            className="mt-1 w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
            value={bridgeDownloadUrlInput}
            disabled={saving}
            placeholder="https://ta.dygdyg.ru/downloads/TrackAnimeDiscordRPC.exe"
            onChange={(event) => setBridgeDownloadUrlInput(event.target.value)}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={() => void save()} className={adminClass.btnPrimary}>
            Сохранить
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void clearApplicationId()}
            className={adminClass.btnSmOff}
          >
            Очистить ID
          </button>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Активный ID</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
              {settings.applicationId ?? "не задан"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Скачивание моста</dt>
            <dd className="mt-0.5 break-all text-xs text-foreground">
              {settings.bridgeDownloadUrl ?? "не задано"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Источник ID</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {settings.source === "database"
                ? "База данных"
                : settings.source === "env"
                  ? ".env"
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Обновлено</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {formatDateTime(settings.updatedAt)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-muted">
          Если ID в базе пустой, используется fallback из{" "}
          <code className="text-xs">DISCORD_APP_ID</code> или{" "}
          <code className="text-xs">NEXT_PUBLIC_DISCORD_APP_ID</code> в .env. В Art Assets загрузите
          иконку 512×512 с ключом из поля выше.
        </p>

        {saveMessage ? (
          <p className={`mt-4 ${saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
            {saveMessage.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
