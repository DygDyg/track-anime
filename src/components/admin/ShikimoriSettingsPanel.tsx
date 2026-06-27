"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { ShikimoriEndpoints, ShikimoriSettingsDto } from "@/lib/shikimori/endpoints";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: ShikimoriSettingsDto;
  presets: string[];
};

function EndpointPreview({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

export function ShikimoriSettingsPanel({
  initialSettings,
  presets,
}: {
  initialSettings: ShikimoriSettingsDto;
  presets: string[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [hostInput, setHostInput] = useState(initialSettings.host);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shikimori/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
      setHostInput(data.settings.host);
    } catch {
      /* ignore */
    }
  }, []);

  async function saveHost(host: string) {
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/shikimori/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
      });
      const data = (await res.json()) as {
        settings?: ShikimoriSettingsDto;
        error?: string;
      };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setHostInput(data.settings.host);
      }
      setSaveMessage({ ok: true, text: "Настройки Shikimori сохранены" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  const endpoints: ShikimoriEndpoints = settings.endpoints;

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Сервер Shikimori</h2>
        <p className="mt-2 text-sm text-muted">
          Хост для API, OAuth и ссылок на профили/аниме. Для записи в списки и избранное обычно
          нужен <code className="text-xs">shikimori.io</code>. Публичное чтение API часто работает
          и на <code className="text-xs">shikimori.one</code>.
        </p>
      </section>

      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Хост</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={saving}
              onClick={() => {
                setHostInput(preset);
                void saveHost(preset);
              }}
              className={settings.host === preset ? adminClass.btnSmOn : adminClass.btnSmOff}
            >
              {preset}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-muted">Свой хост</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              type="text"
              className="min-w-[16rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm text-foreground"
              value={hostInput}
              disabled={saving}
              placeholder="shikimori.io"
              onChange={(event) => setHostInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveHost(hostInput);
                }
              }}
            />
            <button
              type="button"
              disabled={saving || hostInput.trim() === settings.host}
              onClick={() => void saveHost(hostInput)}
              className={adminClass.btnPrimary}
            >
              Сохранить
            </button>
          </div>
        </label>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <EndpointPreview label="API" value={endpoints.apiBase} />
          <EndpointPreview label="OAuth authorize" value={endpoints.oauthAuthorizeUrl} />
          <EndpointPreview label="OAuth token" value={endpoints.oauthTokenUrl} />
          <EndpointPreview label="Whoami" value={endpoints.whoamiUrl} />
          <EndpointPreview label="Ссылки на сайт" value={endpoints.siteOrigin} />
          <div>
            <dt className="text-muted">Обновлено</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {formatDateTime(settings.updatedAt)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-muted">
          После смены хоста пользователям может понадобиться выйти и снова войти через Shikimori.
          Значение из <code className="text-xs">SHIKIMORI_HOST</code> в .env используется только как
          дефолт при первом запуске.
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
