"use client";

import { useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { PlayerProxySettingsDto } from "@/lib/admin/player-proxy-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function endpointFromSettings(settings: PlayerProxySettingsDto): string {
  if (!settings.scheme || !settings.host || !settings.port) return "";
  const user = settings.username ? `${settings.username}@` : "";
  return `${settings.scheme}://${user}${settings.host}:${settings.port}`;
}

type SettingsResponse = {
  settings?: PlayerProxySettingsDto;
  error?: string;
};

export function PlayerProxySettingsPanel({
  initialSettings,
}: {
  initialSettings: PlayerProxySettingsDto;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [endpoint, setEndpoint] = useState(endpointFromSettings(initialSettings));
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/player-proxy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          proxyUrl: endpoint.trim(),
          ...(password ? { password } : {}),
        }),
      });
      const data = (await res.json()) as SettingsResponse;
      if (!res.ok || !data.settings) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }
      setSettings(data.settings);
      setEnabled(data.settings.enabled);
      setEndpoint(endpointFromSettings(data.settings));
      setPassword("");
      setSaveMessage({ ok: true, text: "Прокси плеера сохранён" });
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Прокси плеера</h2>
        <p className="mt-2 text-sm text-muted">
          TA Plus передаёт этот прокси парсеру Kodik. Если выключено, парсер использует прокси,
          заданный на сервере.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">Использовать прокси из админки</span>
            <span className="mt-1 block text-xs text-muted">
              Пароль здесь не показывается. Пустое поле пароля оставляет прежний.
            </span>
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">Адрес</span>
          <input
            type="text"
            value={endpoint}
            disabled={saving}
            autoComplete="off"
            spellCheck={false}
            placeholder="socks5://логин@хост:порт"
            onChange={(event) => setEndpoint(event.target.value)}
            className={`${adminClass.input} w-full`}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">Пароль</span>
          <input
            type="password"
            value={password}
            disabled={saving}
            autoComplete="new-password"
            placeholder={settings.hasPassword ? "Оставьте пустым, чтобы не менять" : "Пароль прокси"}
            onChange={(event) => setPassword(event.target.value)}
            className={`${adminClass.input} w-full`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={adminClass.btnPrimary} disabled={saving} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {saveMessage ? (
            <p className={saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}>{saveMessage.text}</p>
          ) : null}
        </div>

        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
      </section>
    </div>
  );
}
