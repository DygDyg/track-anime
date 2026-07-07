"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFICATION_TEMPLATE_PLACEHOLDERS } from "@/lib/notifications/templates";
import type { NotificationChannelId } from "@/lib/notifications/types";
import type { UserNotificationTemplatePreferencesDto } from "@/lib/notifications/user-templates";

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

type TestSendResponse = {
  error?: string;
  payload?: {
    animeTitle: string;
    seasonNumber: number;
    episodeNumber: number;
    translationName: string;
  };
  results?: Partial<Record<NotificationChannelId, { ok: boolean; detail?: string }>>;
};

const TEST_CHANNEL_LABELS: Partial<Record<NotificationChannelId, string>> = {
  browser: "Браузер",
  telegram: "Telegram",
  vk: "VK",
  discord: "Discord",
};

type TestChannelId = "browser" | "telegram" | "vk" | "discord";

function buildDefaultTestChannels(input: {
  showBrowser: boolean;
  showTelegram: boolean;
  showVk: boolean;
  showDiscord: boolean;
}): Record<TestChannelId, boolean> {
  return {
    browser: input.showBrowser,
    telegram: input.showTelegram,
    vk: input.showVk,
    discord: input.showDiscord,
  };
}

export function NotificationMessageTemplatesSettings({
  templates,
  showBrowser,
  showDiscord,
  showTelegram,
  showVk,
  disabled,
  onSaved,
}: {
  templates: UserNotificationTemplatePreferencesDto;
  showBrowser: boolean;
  showDiscord: boolean;
  showTelegram: boolean;
  showVk: boolean;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState(templates);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testChannels, setTestChannels] = useState(() =>
    buildDefaultTestChannels({ showBrowser, showTelegram, showVk, showDiscord }),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(templates);
  }, [templates]);

  useEffect(() => {
    setTestChannels(buildDefaultTestChannels({ showBrowser, showTelegram, showVk, showDiscord }));
  }, [showBrowser, showDiscord, showTelegram, showVk]);

  const saveTemplates = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDiscordTemplateEnabled: draft.customDiscordTemplateEnabled,
          customTelegramTemplateEnabled: draft.customTelegramTemplateEnabled,
          customVkTemplateEnabled: draft.customVkTemplateEnabled,
          discordTitle: draft.discordTitle,
          discordDescription: draft.discordDescription,
          telegramMessage: draft.telegramMessage,
          vkMessage: draft.vkMessage,
        }),
      });

      if (!res.ok) {
        throw new Error("Не удалось сохранить шаблоны");
      }

      onSaved?.();
      setMessage("Шаблоны сохранены");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ошибка сохранения");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved]);

  const sendTestMessage = useCallback(async () => {
    setTesting(true);
    setMessage(null);
    setError(null);

    const channels = (["browser", "telegram", "vk", "discord"] as const).filter(
      (channel) => testChannels[channel],
    );
    if (channels.length === 0) {
      setError("Выберите хотя бы один канал для тестовой отправки");
      setTesting(false);
      return;
    }

    try {
      const saved = await saveTemplates();
      if (!saved) return;

      const res = await fetch("/api/user/notification-preferences/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels }),
      });
      const data = (await res.json()) as TestSendResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось отправить тест");
      }

      const details = Object.entries(data.results ?? {})
        .filter((entry): entry is [NotificationChannelId, { ok: boolean; detail?: string }] =>
          Boolean(entry[1]),
        )
        .map(([channel, result]) => {
          const label = TEST_CHANNEL_LABELS[channel] ?? channel;
          return `${label}: ${result.ok ? "отправлено" : (result.detail ?? "ошибка")}`;
        });

      const title = data.payload
        ? `Тест отправлен: ${data.payload.animeTitle}`
        : "Тест отправлен";
      setMessage(details.length > 0 ? `${title}. ${details.join("; ")}` : title);
      onSaved?.();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Ошибка тестовой отправки");
    } finally {
      setTesting(false);
    }
  }, [onSaved, saveTemplates, testChannels]);

  const resetToDefaults = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      discordTitle: prev.defaultTemplates.discordTitle,
      discordDescription: prev.defaultTemplates.discordDescription,
      telegramMessage: prev.defaultTemplates.telegramMessage,
      vkMessage: prev.defaultTemplates.vkMessage,
    }));
  }, []);

  if (!showBrowser && !showDiscord && !showTelegram && !showVk) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Личные шаблоны сообщений</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Настройте текст уведомлений для каждого канала. Если личный шаблон выключен, используется
          шаблон сайта из админки.
        </p>
      </div>

      <details className="rounded-md border border-border bg-card px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted">
          Доступные плейсхолдеры
        </summary>
        <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
          {NOTIFICATION_TEMPLATE_PLACEHOLDERS.map((item) => (
            <li key={item.key}>
              <code className="rounded bg-muted/20 px-1 py-0.5 font-mono text-[11px]">{item.key}</code>{" "}
              — {item.description}
            </li>
          ))}
        </ul>
      </details>

      {showDiscord ? (
        <div className="space-y-2">
          <ToggleRow
            label="Discord — свой шаблон"
            hint="Если выключено, используется шаблон сайта"
            checked={draft.customDiscordTemplateEnabled}
            disabled={disabled || saving || testing}
            onChange={(checked) =>
              setDraft((prev) => ({ ...prev, customDiscordTemplateEnabled: checked }))
            }
          />
          {draft.customDiscordTemplateEnabled ? (
            <div className="space-y-2 pl-2 sm:pl-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Заголовок embed</span>
                <input
                  type="text"
                  value={draft.discordTitle}
                  disabled={disabled || saving || testing}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, discordTitle: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Описание embed</span>
                <textarea
                  value={draft.discordDescription}
                  disabled={disabled || saving || testing}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, discordDescription: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {showTelegram ? (
        <div className="space-y-2">
          <ToggleRow
            label="Telegram — свой шаблон"
            hint="Ссылка {pageUrl} — кнопка под сообщением"
            checked={draft.customTelegramTemplateEnabled}
            disabled={disabled || saving || testing}
            onChange={(checked) =>
              setDraft((prev) => ({ ...prev, customTelegramTemplateEnabled: checked }))
            }
          />
          {draft.customTelegramTemplateEnabled ? (
            <label className="block space-y-1 pl-2 sm:pl-4">
              <span className="text-xs font-medium text-foreground">Текст сообщения</span>
              <textarea
                value={draft.telegramMessage}
                disabled={disabled || saving || testing}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, telegramMessage: event.target.value }))
                }
                rows={5}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-sm"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {showVk ? (
        <div className="space-y-2">
          <ToggleRow
            label="VK — свой шаблон"
            hint="Ссылка {pageUrl} — кнопка под сообщением"
            checked={draft.customVkTemplateEnabled}
            disabled={disabled || saving || testing}
            onChange={(checked) =>
              setDraft((prev) => ({ ...prev, customVkTemplateEnabled: checked }))
            }
          />
          {draft.customVkTemplateEnabled ? (
            <label className="block space-y-1 pl-2 sm:pl-4">
              <span className="text-xs font-medium text-foreground">Текст сообщения</span>
              <textarea
                value={draft.vkMessage}
                disabled={disabled || saving || testing}
                onChange={(event) => setDraft((prev) => ({ ...prev, vkMessage: event.target.value }))}
                rows={5}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-sm"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2.5">
        <p className="text-xs font-medium text-foreground">Тестовая отправка</p>
        <p className="text-xs leading-relaxed text-muted">
          Отправит уведомление о тайтле Shikimori 50346 с текущими шаблонами.
        </p>
        <div className="flex flex-wrap gap-3">
          {showBrowser ? (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={testChannels.browser}
                disabled={disabled || saving || testing}
                onChange={(event) =>
                  setTestChannels((prev) => ({ ...prev, browser: event.target.checked }))
                }
                className="site-checkbox"
              />
              Браузер
            </label>
          ) : null}
          {showTelegram ? (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={testChannels.telegram}
                disabled={disabled || saving || testing}
                onChange={(event) =>
                  setTestChannels((prev) => ({ ...prev, telegram: event.target.checked }))
                }
                className="site-checkbox"
              />
              Telegram
            </label>
          ) : null}
          {showVk ? (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={testChannels.vk}
                disabled={disabled || saving || testing}
                onChange={(event) =>
                  setTestChannels((prev) => ({ ...prev, vk: event.target.checked }))
                }
                className="site-checkbox"
              />
              VK
            </label>
          ) : null}
          {showDiscord ? (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={testChannels.discord}
                disabled={disabled || saving || testing}
                onChange={(event) =>
                  setTestChannels((prev) => ({ ...prev, discord: event.target.checked }))
                }
                className="site-checkbox"
              />
              Discord
            </label>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || saving || testing}
          onClick={() => void saveTemplates()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить шаблоны"}
        </button>
        <button
          type="button"
          disabled={disabled || saving || testing}
          onClick={() => void sendTestMessage()}
          className="rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {testing ? "Отправка…" : "Отправить тестовое сообщение"}
        </button>
        <button
          type="button"
          disabled={disabled || saving || testing}
          onClick={resetToDefaults}
          className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          Подставить шаблон сайта
        </button>
      </div>

      {message ? <p className="text-xs text-emerald-400">{message}</p> : null}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
