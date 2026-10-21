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

type ProxyCheckLeg = {
  ok: boolean;
  regionBlocked: boolean;
  message: string;
  ms: number;
};

type ProxyCheckResult = {
  title: string;
  season: number;
  episode: number;
  proxyLabel: string;
  direct: ProxyCheckLeg;
  viaProxy: ProxyCheckLeg;
};

type CheckResponse = {
  check?: ProxyCheckResult;
  error?: string;
};

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  const text = seconds < 10 ? seconds.toFixed(1).replace(".", ",") : String(Math.round(seconds));
  return `${text} с`;
}

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
  const [checking, setChecking] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [checkResult, setCheckResult] = useState<ProxyCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

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

  async function checkProxy() {
    setChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const res = await fetch("/api/admin/player-proxy/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxyUrl: endpoint.trim(),
          ...(password ? { password } : {}),
        }),
      });
      const data = (await res.json()) as CheckResponse;
      if (!res.ok || !data.check) {
        setCheckError(data.error ?? "Не удалось проверить прокси");
        return;
      }
      setCheckResult(data.check);
    } catch {
      setCheckError("Ошибка сети");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Прокси плеера</h2>
        <p className="mt-2 text-sm text-muted">
          TA Plus передаёт этот прокси парсеру Kodik. Если выключено, парсер ходит к Kodik напрямую.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving || checking}
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
            disabled={saving || checking}
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
            disabled={saving || checking}
            autoComplete="new-password"
            placeholder={settings.hasPassword ? "Оставьте пустым, чтобы не менять" : "Пароль прокси"}
            onChange={(event) => setPassword(event.target.value)}
            className={`${adminClass.input} w-full`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={adminClass.btnPrimary} disabled={saving || checking} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            className={adminClass.btnSecondary}
            disabled={saving || checking}
            onClick={() => void checkProxy()}
          >
            {checking ? "Проверка…" : "Проверить прокси"}
          </button>
          {saveMessage ? (
            <p className={saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}>{saveMessage.text}</p>
          ) : null}
        </div>

        <p className="text-xs text-muted">
          Проверка запрашивает серию «Необъятный океан»: без прокси Kodik закрывает её для этой страны.
          Настройки при этом не сохраняются.
        </p>

        {checkError ? <p className={adminClass.alertError}>{checkError}</p> : null}
        {checkResult ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-foreground">
              {checkResult.title}, сезон {checkResult.season}, серия {checkResult.episode}
            </p>
            <p className={checkResult.direct.regionBlocked ? "text-muted" : adminClass.alertError}>
              Без прокси: {checkResult.direct.message} · {formatSeconds(checkResult.direct.ms)}
            </p>
            <p className={checkResult.viaProxy.ok ? adminClass.alertSuccess : adminClass.alertError}>
              Через {checkResult.proxyLabel}: {checkResult.viaProxy.message} ·{" "}
              {formatSeconds(checkResult.viaProxy.ms)}
            </p>
          </div>
        ) : null}

        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
      </section>
    </div>
  );
}
