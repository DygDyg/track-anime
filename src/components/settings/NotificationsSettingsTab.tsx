"use client";

import { NotificationMessageTemplatesSettings } from "@/components/settings/NotificationMessageTemplatesSettings";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeBrowserPush, unsubscribeBrowserPush, hasActivePushSubscription, readBrowserPushEnabled } from "@/lib/notifications/browser-client";
import {
  hasActiveAndroidFcmSubscription,
  isAndroidFcmBridgeAvailable,
  readAndroidFcmEnabled,
  subscribeAndroidFcm,
  unsubscribeAndroidFcm,
} from "@/lib/notifications/fcm-client";
import {
  emitNotificationsPrefsChanged,
  resetInAppNotifySince,
} from "@/lib/notifications/in-app-client";
import type { UserNotificationPreferencesDto } from "@/lib/notifications/types";

function ToggleRow({
  label,
  hint,
  hintOnClick,
  checked,
  onChange,
  disabled = false,
  compact = false,
  className = "",
}: {
  label: string;
  hint?: string;
  hintOnClick?: () => void;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        compact ? "notifications-toggle-row py-1.5" : "rounded-lg border border-border bg-card px-3 py-2.5",
        disabled ? "opacity-60" : "",
        className,
      ].join(" ")}
    >
      <label
        className={[
          "flex items-start gap-3",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
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
          {hint && !hintOnClick ? (
            <span className="mt-0.5 block text-xs text-muted">{hint}</span>
          ) : null}
        </span>
      </label>
      {hint && hintOnClick ? (
        <button
          type="button"
          onClick={hintOnClick}
          className="ml-7 mt-0.5 block text-left text-xs text-accent transition hover:text-accent/80 hover:underline"
        >
          {hint}
        </button>
      ) : null}
    </div>
  );
}

export function NotificationsSettingsTab({ variant = "full" }: { variant?: "full" | "compact" }) {
  const searchParams = useSearchParams();
  const { openSettings } = useSiteSettings();
  const isCompact = variant === "compact";
  const openChannelsSettings = useCallback(() => openSettings("notifications"), [openSettings]);
  const [prefs, setPrefs] = useState<UserNotificationPreferencesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discordVerifying, setDiscordVerifying] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [vkDeepLink, setVkDeepLink] = useState<string | null>(null);
  const [browserPushEnabled, setBrowserPushEnabled] = useState(false);
  const [browserPushActive, setBrowserPushActive] = useState(false);
  const [androidShell, setAndroidShell] = useState(false);
  const [androidFcmEnabled, setAndroidFcmEnabled] = useState(false);
  const [androidFcmActive, setAndroidFcmActive] = useState(false);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user/notification-preferences");
      if (!res.ok) {
        throw new Error("Не удалось загрузить настройки");
      }
      const data = (await res.json()) as { preferences: UserNotificationPreferencesDto };
      setPrefs(data.preferences);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setBrowserPushEnabled(readBrowserPushEnabled());
    void hasActivePushSubscription().then(setBrowserPushActive);
    const android = isAndroidFcmBridgeAvailable();
    setAndroidShell(android);
    setAndroidFcmEnabled(readAndroidFcmEnabled());
    if (android) {
      void hasActiveAndroidFcmSubscription().then(setAndroidFcmActive);
    }
  }, []);

  useEffect(() => {
    const discord = searchParams.get("discord");
    const reason = searchParams.get("reason");
    if (discord === "linked") {
      const dmPending = searchParams.get("dm") === "pending";
      setMessage(
        dmPending
          ? "Discord привязан. Вступите на официальный сервер или добавьте бота на свой, затем нажмите «Проверить»."
          : "Discord привязан — проверьте личные сообщения от бота",
      );
      void loadPreferences();
    } else if (discord === "error") {
      const reasonMessages: Record<string, string> = {
        guild_join_failed:
          "Не удалось добавить вас на сервер уведомлений. Проверьте, что в админке указан Guild ID и бот на этом сервере. Попробуйте привязать снова.",
        guild_not_configured: "На сервере не настроен Guild ID для Discord-уведомлений.",
        discord_already_linked: "Этот Discord уже привязан к другому аккаунту.",
        token_exchange_failed: "Ошибка OAuth Discord — попробуйте снова.",
      };
      const text = reason ? (reasonMessages[reason] ?? `Discord: ${reason}`) : "Не удалось привязать Discord";
      setError(text);
    }

    if (discord) {
      const params = new URLSearchParams(window.location.search);
      params.delete("discord");
      params.delete("reason");
      params.delete("dm");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [searchParams, loadPreferences]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const savePreferences = useCallback(
    async (patch: Partial<UserNotificationPreferencesDto>) => {
      if (!prefs) return;
      setSaving(true);
      setMessage(null);
      setError(null);

      const next = { ...prefs, ...patch };
      setPrefs(next);

      try {
        const res = await fetch("/api/user/notification-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            historyNewEnabled: next.historyNewEnabled,
            telegramEnabled: next.telegramEnabled,
            vkEnabled: next.vkEnabled,
            discordEnabled: next.discordEnabled,
          }),
        });

        if (!res.ok) {
          throw new Error("Не удалось сохранить настройки");
        }

        const data = (await res.json()) as { preferences: UserNotificationPreferencesDto };
        setPrefs(data.preferences);
        setMessage("Сохранено");
        emitNotificationsPrefsChanged();
        if (patch.historyNewEnabled === true) {
          resetInAppNotifySince();
        }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Ошибка сохранения");
        void loadPreferences();
      } finally {
        setSaving(false);
      }
    },
    [prefs, loadPreferences],
  );

  const enableBrowserPush = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const result = await subscribeBrowserPush();
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setBrowserPushEnabled(true);
    setBrowserPushActive(true);
    if (!prefs?.historyNewEnabled) {
      await savePreferences({ historyNewEnabled: true });
    }
    resetInAppNotifySince();
    emitNotificationsPrefsChanged();
    setMessage("Браузерные уведомления включены в этом браузере");
    setSaving(false);
  }, [savePreferences, prefs?.historyNewEnabled]);

  const disableBrowserPush = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    await unsubscribeBrowserPush();
    setBrowserPushEnabled(false);
    setBrowserPushActive(false);
    emitNotificationsPrefsChanged();
    setMessage("Браузерные уведомления отключены в этом браузере");
    setSaving(false);
  }, []);

  const enableAndroidFcm = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const result = await subscribeAndroidFcm();
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setAndroidFcmEnabled(true);
    setAndroidFcmActive(true);
    if (!prefs?.historyNewEnabled) {
      await savePreferences({ historyNewEnabled: true });
    }
    resetInAppNotifySince();
    emitNotificationsPrefsChanged();
    setMessage("Уведомления Android включены на этом устройстве");
    setSaving(false);
  }, [savePreferences, prefs?.historyNewEnabled]);

  const disableAndroidFcm = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    await unsubscribeAndroidFcm();
    setAndroidFcmEnabled(false);
    setAndroidFcmActive(false);
    emitNotificationsPrefsChanged();
    setMessage("Уведомления Android отключены на этом устройстве");
    setSaving(false);
  }, []);

  const linkTelegram = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/notifications/telegram/link", { method: "POST" });
      const data = (await res.json()) as { deepLink?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось получить ссылку");
      }
      setTelegramDeepLink(data.deepLink ?? null);
      setMessage("Откройте ссылку в Telegram и нажмите Start");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Ошибка привязки");
    } finally {
      setSaving(false);
    }
  }, []);

  const unlinkTelegram = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    await fetch("/api/notifications/telegram/link", { method: "DELETE" });
    setTelegramDeepLink(null);
    await loadPreferences();
    setMessage("Telegram отвязан");
    setSaving(false);
  }, [loadPreferences]);

  const linkVk = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/notifications/vk/link", { method: "POST" });
      const data = (await res.json()) as { deepLink?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось получить ссылку");
      }
      setVkDeepLink(data.deepLink ?? null);
      setMessage("Откройте ссылку во VK и напишите сообществу");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Ошибка привязки");
    } finally {
      setSaving(false);
    }
  }, []);

  const unlinkVkAccount = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    await fetch("/api/notifications/vk/link", { method: "DELETE" });
    setVkDeepLink(null);
    await loadPreferences();
    setMessage("VK отвязан");
    setSaving(false);
  }, [loadPreferences]);

  const linkDiscord = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/notifications/discord/link");
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Не удалось начать привязку Discord");
      }
      window.location.href = data.url;
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Ошибка привязки Discord");
      setSaving(false);
    }
  }, []);

  const verifyDiscord = useCallback(async () => {
    setDiscordVerifying(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/notifications/discord/verify", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Бот всё ещё не может написать в ЛС");
      }
      await loadPreferences();
      setMessage("Готово — приветственное сообщение отправлено в Discord");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Не удалось проверить Discord");
    } finally {
      setDiscordVerifying(false);
    }
  }, [loadPreferences]);

  const unlinkDiscordAccount = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    await fetch("/api/notifications/discord/unlink", { method: "DELETE" });
    await loadPreferences();
    setMessage("Discord отвязан");
    setSaving(false);
  }, [loadPreferences]);

  if (loading) {
    return <p className="text-sm text-muted">Загрузка…</p>;
  }

  if (!prefs) {
    return <p className="text-sm text-rose-400">{error ?? "Не удалось загрузить настройки"}</p>;
  }

  const hasNotificationChannels =
    prefs.browserPushConfigured ||
    prefs.fcmConfigured ||
    prefs.telegramConfigured ||
    prefs.vkConfigured ||
    prefs.discordConfigured;

  const channelToggles = hasNotificationChannels ? (
    <div className={isCompact ? "contents" : "space-y-2"}>
      {!isCompact ? <p className="text-xs font-medium uppercase tracking-wide text-muted">Каналы</p> : null}

      {prefs.fcmConfigured && androidShell ? (
        <ToggleRow
          compact={isCompact}
          label="Уведомления Android"
          hint={
            isCompact
              ? androidFcmActive
                ? "FCM на этом устройстве"
                : "Фон даже при закрытом приложении"
              : androidFcmActive
                ? "FCM подключён — баннеры приходят при закрытом приложении"
                : "Системные уведомления через Google (нужно разрешение)"
          }
          checked={androidFcmEnabled}
          disabled={saving || !prefs.historyNewEnabled}
          onChange={(checked) => {
            if (checked) {
              void enableAndroidFcm();
              return;
            }
            void disableAndroidFcm();
          }}
        />
      ) : null}

      {prefs.browserPushConfigured && !androidShell ? (
        <ToggleRow
          compact={isCompact}
          label="Уведомления в браузере"
          hint={
            isCompact
              ? browserPushActive
                ? "Push в этом браузере"
                : "Только этот браузер"
              : browserPushActive
                ? "Push подключён в этом браузере"
                : "Настройка только для этого браузера — нужно разрешение и production-сборка"
          }
          checked={browserPushEnabled}
          disabled={saving || !prefs.historyNewEnabled}
          onChange={(checked) => {
            if (checked) {
              void enableBrowserPush();
              return;
            }
            void disableBrowserPush();
          }}
        />
      ) : null}

      {prefs.telegramConfigured ? (
        isCompact ? (
          <ToggleRow
            compact
            label="Telegram"
            hint={
              prefs.telegramLinked
                ? prefs.telegramBotUsername
                  ? `@${prefs.telegramBotUsername}`
                  : "Привязан"
                : "Привязка в настройках"
            }
            hintOnClick={!prefs.telegramLinked ? openChannelsSettings : undefined}
            checked={prefs.telegramEnabled}
            disabled={saving || !prefs.historyNewEnabled || !prefs.telegramLinked}
            onChange={(checked) => void savePreferences({ telegramEnabled: checked })}
          />
        ) : (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <ToggleRow
            label="Telegram"
            hint={
              prefs.telegramLinked
                ? `Привязан${prefs.telegramBotUsername ? ` (@${prefs.telegramBotUsername})` : ""}`
                : "Привяжите бота по ссылке"
            }
            checked={prefs.telegramEnabled}
            disabled={saving || !prefs.historyNewEnabled || !prefs.telegramLinked}
            onChange={(checked) => void savePreferences({ telegramEnabled: checked })}
          />
            <div className="mt-2 flex flex-wrap gap-2 pl-7">
              {!prefs.telegramLinked ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void linkTelegram()}
                  className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
                >
                  {saving ? "Получаем ссылку…" : "Получить ссылку для привязки"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void unlinkTelegram()}
                  className="rounded-md px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                >
                  {saving ? "Отвязка…" : "Отвязать"}
                </button>
              )}
              {telegramDeepLink ? (
                <Link
                  href={telegramDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90"
                >
                  Открыть в Telegram
                </Link>
              ) : null}
            </div>
        </div>
        )
      ) : null}

      {prefs.vkConfigured ? (
        isCompact ? (
          <ToggleRow
            compact
            label="VK"
            hint={prefs.vkLinked ? "Привязан" : "Привязка в настройках"}
            hintOnClick={!prefs.vkLinked ? openChannelsSettings : undefined}
            checked={prefs.vkEnabled}
            disabled={saving || !prefs.historyNewEnabled || !prefs.vkLinked}
            onChange={(checked) => void savePreferences({ vkEnabled: checked })}
          />
        ) : (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <ToggleRow
            label="VK"
            hint={prefs.vkLinked ? "Сообщество привязано" : "Привяжите сообщество по ссылке"}
            checked={prefs.vkEnabled}
            disabled={saving || !prefs.historyNewEnabled || !prefs.vkLinked}
            onChange={(checked) => void savePreferences({ vkEnabled: checked })}
          />
            <div className="mt-2 flex flex-wrap gap-2 pl-7">
              {!prefs.vkLinked ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void linkVk()}
                  className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
                >
                  {saving ? "Получаем ссылку…" : "Получить ссылку для привязки"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void unlinkVkAccount()}
                  className="rounded-md px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                >
                  {saving ? "Отвязка…" : "Отвязать"}
                </button>
              )}
              {vkDeepLink ? (
                <Link
                  href={vkDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90"
                >
                  Открыть во VK
                </Link>
              ) : null}
            </div>
        </div>
        )
      ) : null}

      {prefs.discordConfigured ? (
        isCompact ? (
          <ToggleRow
            compact
            label="Discord"
            hint={
              !prefs.discordLinked
                ? "Привязка в настройках"
                : !prefs.discordDmVerified
                  ? "Нужна проверка в настройках"
                  : "Привязан"
            }
            hintOnClick={
              !prefs.discordLinked || !prefs.discordDmVerified ? openChannelsSettings : undefined
            }
            checked={prefs.discordEnabled}
            disabled={
              saving || !prefs.historyNewEnabled || !prefs.discordLinked || !prefs.discordDmVerified
            }
            onChange={(checked) => void savePreferences({ discordEnabled: checked })}
          />
        ) : (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <ToggleRow
            label="Discord"
            hint={
              prefs.discordLinked && !prefs.discordDmVerified
                ? "Привязан, но бот не может писать в ЛС — вступите на сервер или добавьте бота"
                : prefs.discordLinked
                  ? "Аккаунт привязан, уведомления в личные сообщения"
                  : "OAuth-привязка, не Discord RPC"
            }
            checked={prefs.discordEnabled}
            disabled={
              saving || !prefs.historyNewEnabled || !prefs.discordLinked || !prefs.discordDmVerified
            }
            onChange={(checked) => void savePreferences({ discordEnabled: checked })}
          />
            <div className="mt-2 space-y-2 pl-7">
              {!prefs.discordLinked ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void linkDiscord()}
                  className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
                >
                  Привязать Discord
                </button>
              ) : (
                <>
                  {prefs.discordLinked && !prefs.discordDmVerified ? (
                    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                      <p className="text-xs leading-relaxed text-muted">
                        По правилам Discord бот может писать в личные сообщения только если вы с ним
                        на одном сервере. Выберите один из вариантов:{" "}
                        {prefs.discordInviteUrl ? (
                          <a
                            href={prefs.discordInviteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            вступить на официальный сервер сайта
                          </a>
                        ) : (
                          "вступить на официальный сервер сайта"
                        )}{" "}
                        или{" "}
                        {prefs.discordBotInviteUrl ? (
                          <a
                            href={prefs.discordBotInviteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            добавить бота на свой сервер
                          </a>
                        ) : (
                          "добавить бота на свой сервер"
                        )}
                        . Затем нажмите «Проверить» — бот отправит тестовое приветствие с логотипом
                        сайта.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {prefs.discordInviteUrl ? (
                          <a
                            href={prefs.discordInviteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90"
                          >
                            Вступить на сервер
                          </a>
                        ) : null}
                        {prefs.discordBotInviteUrl ? (
                          <a
                            href={prefs.discordBotInviteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25"
                          >
                            Добавить бота на сервер
                          </a>
                        ) : null}
                        {!prefs.discordInviteUrl && !prefs.discordBotInviteUrl ? (
                          <span className="text-xs text-rose-400">
                            Ссылки не настроены — обратитесь к администратору
                          </span>
                        ) : null}
                        <button
                          type="button"
                          disabled={saving || discordVerifying}
                          onClick={() => void verifyDiscord()}
                          className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
                        >
                          {discordVerifying ? "Проверка…" : "Проверить"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void unlinkDiscordAccount()}
                    className="rounded-md px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
                  >
                    Отвязать
                  </button>
                </>
              )}
            </div>
        </div>
        )
      ) : null}
    </div>
  ) : null;

  return (
    <div className={isCompact ? "space-y-3" : "space-y-5"}>
      <div className={isCompact ? "flex items-start justify-between gap-3" : undefined}>
        <div className={isCompact ? "min-w-0" : undefined}>
          <h3 className="text-sm font-semibold text-foreground">
            {isCompact ? "Уведомления о новых сериях" : "Новое в вашей истории"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {isCompact
              ? "Сообщим о продолжении в той же озвучке."
              : "Уведомление при выходе новой серии в тайтле из вашей истории просмотра — в той же озвучке, что вы смотрели. При открытой вкладке сайт опрашивает сервер каждые 30\u00a0с; для фона включите push в браузере или уведомления Android в приложении."}
          </p>
        </div>
        {isCompact ? (
          <button
            type="button"
            onClick={() => openSettings("notifications")}
            className="shrink-0 text-xs font-medium text-accent transition hover:text-accent/80"
          >
            Каналы и привязки
          </button>
        ) : null}
      </div>

      {isCompact ? (
        <div className="notifications-compact-toggles">
          <ToggleRow
            compact
            label="Новые серии из истории"
            checked={prefs.historyNewEnabled}
            disabled={saving}
            onChange={(checked) => void savePreferences({ historyNewEnabled: checked })}
          />
          {channelToggles}
        </div>
      ) : (
        <>
          <ToggleRow
            label="Включить уведомления о новых сериях из истории"
            checked={prefs.historyNewEnabled}
            disabled={saving}
            onChange={(checked) => void savePreferences({ historyNewEnabled: checked })}
          />
          {channelToggles}
        </>
      )}

      {!isCompact && hasNotificationChannels && prefs.messageTemplates ? (
        <NotificationMessageTemplatesSettings
          templates={prefs.messageTemplates}
          showBrowser={prefs.browserPushConfigured && !androidShell}
          showFcm={prefs.fcmConfigured && androidShell}
          showDiscord={prefs.discordConfigured}
          showTelegram={prefs.telegramConfigured}
          showVk={prefs.vkConfigured}
          disabled={saving}
          onSaved={() => void loadPreferences()}
        />
      ) : null}

      {message ? <p className="text-xs text-emerald-400">{message}</p> : null}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
