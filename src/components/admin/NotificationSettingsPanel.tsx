"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { NotificationSettingsDto } from "@/lib/admin/notification-settings";
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
  type NotificationMessageTemplates,
} from "@/lib/notifications/templates";

type UserOption = {
  id: string;
  shikimoriId: number;
  nickname: string;
};

const DEFAULT_TEST_SHIKIMORI_ID = "50346";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

function SecretInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${adminClass.input} w-full`}
      />
    </label>
  );
}

export function NotificationSettingsPanel({
  initialSettings,
  currentUserId,
}: {
  initialSettings: NotificationSettingsDto;
  currentUserId: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramBotUsername, setTelegramBotUsername] = useState(
    initialSettings.telegramBotUsername ?? "",
  );
  const [vkBotToken, setVkBotToken] = useState("");
  const [vkGroupId, setVkGroupId] = useState(initialSettings.vkGroupId ?? "");
  const [vkGroupScreenName, setVkGroupScreenName] = useState(
    initialSettings.vkGroupScreenName ?? "",
  );
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [vapidPrivateKey, setVapidPrivateKey] = useState("");
  const [vapidSubject, setVapidSubject] = useState(initialSettings.vapidSubject ?? "");
  const [discordClientId, setDiscordClientId] = useState(
    initialSettings.discordNotificationClientId ?? "",
  );
  const [discordClientSecret, setDiscordClientSecret] = useState("");
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState(
    initialSettings.discordNotificationGuildId ?? "",
  );
  const [discordInviteUrl, setDiscordInviteUrl] = useState(
    initialSettings.discordNotificationInviteUrl ?? "",
  );
  const [discordBotInviteUrl, setDiscordBotInviteUrl] = useState(
    initialSettings.discordNotificationBotInviteUrl ?? "",
  );
  const [messageTemplates, setMessageTemplates] = useState<NotificationMessageTemplates>(
    initialSettings.messageTemplates,
  );
  const [saving, setSaving] = useState(false);
  const [generatingVapid, setGeneratingVapid] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [testUserId, setTestUserId] = useState(currentUserId);
  const [testShikimoriId, setTestShikimoriId] = useState(DEFAULT_TEST_SHIKIMORI_ID);
  const [testSeason, setTestSeason] = useState("");
  const [testEpisode, setTestEpisode] = useState("");
  const [testChannels, setTestChannels] = useState({
    browser: true,
    telegram: true,
    vk: true,
    discord: true,
  });
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { users: UserOption[] };
      setUsers(data.users);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function generateVapidKeys() {
    if (
      settings.vapidPublicKeySet &&
      !window.confirm(
        "Уже есть VAPID-ключи. Заменить? Старые подписки на push перестанут работать, пользователям нужно будет подписаться заново.",
      )
    ) {
      return;
    }

    setGeneratingVapid(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/notifications/generate-vapid", { method: "POST" });
      const data = (await res.json()) as {
        settings?: NotificationSettingsDto;
        publicKey?: string;
        error?: string;
      };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сгенерировать ключи" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setVapidPublicKey("");
        setVapidPrivateKey("");
      }

      setSaveMessage({
        ok: true,
        text: data.publicKey
          ? `VAPID-ключи сгенерированы и сохранены. Public key: ${data.publicKey}`
          : "VAPID-ключи сгенерированы и сохранены",
      });
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setGeneratingVapid(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveMessage(null);

    try {
      const body: Record<string, unknown> = {
        telegramBotUsername: telegramBotUsername.trim() || null,
        vkGroupId: vkGroupId.trim() || null,
        vkGroupScreenName: vkGroupScreenName.trim() || null,
        vapidSubject: vapidSubject.trim() || null,
        discordNotificationClientId: discordClientId.trim() || null,
        discordNotificationGuildId: discordGuildId.trim() || null,
        discordNotificationInviteUrl: discordInviteUrl.trim() || null,
        discordNotificationBotInviteUrl: discordBotInviteUrl.trim() || null,
        messageTemplates,
      };

      if (telegramBotToken.trim()) body.telegramBotToken = telegramBotToken.trim();
      if (vkBotToken.trim()) body.vkBotToken = vkBotToken.trim();
      if (vapidPublicKey.trim()) body.vapidPublicKey = vapidPublicKey.trim();
      if (vapidPrivateKey.trim()) body.vapidPrivateKey = vapidPrivateKey.trim();
      if (discordClientSecret.trim()) body.discordNotificationClientSecret = discordClientSecret.trim();
      if (discordBotToken.trim()) body.discordNotificationBotToken = discordBotToken.trim();

      const res = await fetch("/api/admin/notifications/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { settings?: NotificationSettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setMessageTemplates(data.settings.messageTemplates);
        setTelegramBotUsername(data.settings.telegramBotUsername ?? "");
        setVkGroupId(data.settings.vkGroupId ?? "");
        setVkGroupScreenName(data.settings.vkGroupScreenName ?? "");
        setVapidSubject(data.settings.vapidSubject ?? "");
        setDiscordClientId(data.settings.discordNotificationClientId ?? "");
        setDiscordGuildId(data.settings.discordNotificationGuildId ?? "");
        setDiscordInviteUrl(data.settings.discordNotificationInviteUrl ?? "");
        setDiscordBotInviteUrl(data.settings.discordNotificationBotInviteUrl ?? "");
        setTelegramBotToken("");
        setVkBotToken("");
        setVapidPublicKey("");
        setVapidPrivateKey("");
        setDiscordClientSecret("");
        setDiscordBotToken("");
      }

      setSaveMessage({ ok: true, text: "Настройки уведомлений сохранены" });
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMessage(null);

    const channels = (["browser", "telegram", "vk", "discord"] as const).filter((id) => testChannels[id]);

    try {
      const res = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: testUserId,
          shikimoriId: Number(testShikimoriId),
          seasonNumber: testSeason ? Number(testSeason) : undefined,
          episodeNumber: testEpisode ? Number(testEpisode) : undefined,
          channels,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        payload?: { animeTitle: string; seasonNumber: number; episodeNumber: number };
        results?: Record<string, { ok: boolean; detail?: string }>;
      };

      if (!res.ok) {
        setTestMessage({ ok: false, text: data.error ?? "Ошибка отправки" });
        return;
      }

      const lines = data.payload
        ? [`${data.payload.animeTitle} — S${data.payload.seasonNumber}E${data.payload.episodeNumber}`]
        : [];

      if (data.results) {
        for (const [channel, result] of Object.entries(data.results)) {
          lines.push(`${channel}: ${result.ok ? "OK" : "ошибка"}${result.detail ? ` (${result.detail})` : ""}`);
        }
      }

      setTestMessage({ ok: true, text: lines.join("\n") });
    } catch {
      setTestMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Уведомления</h1>
        <p className="mt-2 text-sm text-muted">
          API Telegram, VK, Discord DM и Web Push (VAPID). Пустые секретные поля при сохранении не перезаписывают
          уже сохранённые значения. Env используется как fallback, если в БД пусто.
        </p>
      </header>

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">Статус</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className={adminClass.statLabel}>Telegram</p>
            <p className={adminClass.statValue}>{settings.telegramConfigured ? "OK" : "—"}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>VK</p>
            <p className={adminClass.statValue}>{settings.vkConfigured ? "OK" : "—"}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Discord DM</p>
            <p className={adminClass.statValue}>{settings.discordConfigured ? "OK" : "—"}</p>
            {settings.discordConfigured && settings.discordBotApplicationMatch === false ? (
              <p className={`mt-1 text-xs ${adminClass.alertError}`}>
                Bot Token не от этого Client ID
              </p>
            ) : null}
            {settings.discordConfigured && !settings.discordNotificationGuildId ? (
              <p className={`mt-1 text-xs ${adminClass.alertError}`}>
                Укажите Guild ID — без сервера DM не дойдут
              </p>
            ) : null}
          </div>
          <div>
            <p className={adminClass.statLabel}>Web Push</p>
            <p className={adminClass.statValue}>{settings.webPushConfigured ? "OK" : "—"}</p>
          </div>
        </div>
        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
        {settings.envFallback.telegram || settings.envFallback.vk || settings.envFallback.discord || settings.envFallback.vapid ? (
          <p className={`text-xs ${adminClass.alertSuccess}`}>
            Fallback из .env:{" "}
            {[
              settings.envFallback.telegram ? "Telegram" : null,
              settings.envFallback.vk ? "VK" : null,
              settings.envFallback.discord ? "Discord" : null,
              settings.envFallback.vapid ? "VAPID" : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        ) : null}
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">Telegram</h2>
        <SecretInput
          label="Bot Token"
          hint={
            settings.telegramBotTokenSet
              ? "Токен сохранён — введите новый, чтобы заменить. Только токен из @BotFather (123456789:AAH...), не ссылка t.me"
              : "Токен из @BotFather → /token. Формат: 123456789:AAH..."
          }
          value={telegramBotToken}
          onChange={setTelegramBotToken}
          placeholder={settings.telegramBotTokenSet ? "••••••••" : "123456:ABC..."}
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Username бота</span>
          <input
            type="text"
            value={telegramBotUsername}
            onChange={(event) => setTelegramBotUsername(event.target.value)}
            placeholder="TrackAnimeBot"
            className={`${adminClass.input} w-full`}
          />
        </label>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">VK</h2>
        <p className="text-xs text-muted">
          Ключ доступа сообщества: «Сообщения сообщества», «Управление сообществом» и «Фото» (для
          обложки в уведомлениях). В сообщениях → «Возможности ботов» — «Включены». Long Poll бот:{" "}
          <code className={adminClass.code}>npm run notifications:vk-bot</code>.
        </p>
        <SecretInput
          label="Ключ доступа сообщества"
          hint={
            settings.vkBotTokenSet
              ? "Ключ сохранён — введите новый, чтобы заменить"
              : "Управление сообществом → Работа с API → Ключи доступа"
          }
          value={vkBotToken}
          onChange={setVkBotToken}
          placeholder={settings.vkBotTokenSet ? "••••••••" : "vk1.a...."}
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">ID сообщества</span>
          <span className="block text-xs text-muted">
            Числовой ID без минуса (из адреса vk.com/club123456789 → 123456789).
          </span>
          <input
            type="text"
            value={vkGroupId}
            onChange={(event) => setVkGroupId(event.target.value)}
            placeholder="123456789"
            className={`${adminClass.input} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Короткий адрес (необязательно)</span>
          <span className="block text-xs text-muted">
            screen_name для ссылки vk.me/… при привязке. Если пусто — подтянется из API или
            используется write-ID.
          </span>
          <input
            type="text"
            value={vkGroupScreenName}
            onChange={(event) => setVkGroupScreenName(event.target.value)}
            placeholder="track_anime"
            className={`${adminClass.input} w-full`}
          />
        </label>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">Web Push (VAPID)</h2>
        <p className="text-xs text-muted">
          Сгенерируйте пару ключей одной кнопкой или вставьте свои. Subject — обычно{" "}
          <code className={adminClass.code}>mailto:admin@example.com</code>.
        </p>
        {settings.vapidPublicKeyPreview ? (
          <p className="text-xs text-muted">Текущий public key: {settings.vapidPublicKeyPreview}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void generateVapidKeys()}
          disabled={generatingVapid}
          className={adminClass.btnSecondary}
        >
          {generatingVapid ? "Генерация…" : "Сгенерировать ключи"}
        </button>
        <SecretInput
          label="VAPID Public Key"
          value={vapidPublicKey}
          onChange={setVapidPublicKey}
          placeholder={settings.vapidPublicKeySet ? "••••••••" : ""}
        />
        <SecretInput
          label="VAPID Private Key"
          value={vapidPrivateKey}
          onChange={setVapidPrivateKey}
          placeholder={settings.vapidPrivateKeySet ? "••••••••" : ""}
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">VAPID Subject</span>
          <input
            type="text"
            value={vapidSubject}
            onChange={(event) => setVapidSubject(event.target.value)}
            placeholder="mailto:admin@example.com"
            className={`${adminClass.input} w-full`}
          />
        </label>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">Discord (уведомления в DM)</h2>
        <p className="text-xs text-muted">
          Отдельно от Discord RPC. Redirect URI:{" "}
          <code className={adminClass.code}>/api/notifications/discord/callback</code>. Бот должен
          быть добавлен на сервер уведомлений; при привязке пользователь автоматически вступает на
          этот сервер (scope <code className={adminClass.code}>guilds.join</code>). Client ID, Client
          Secret и Bot Token — из одного приложения в Discord Developer Portal.
        </p>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Client ID</span>
          <input
            type="text"
            value={discordClientId}
            onChange={(event) => setDiscordClientId(event.target.value)}
            className={`${adminClass.input} w-full`}
          />
        </label>
        <SecretInput
          label="Client Secret"
          value={discordClientSecret}
          onChange={setDiscordClientSecret}
          placeholder={settings.discordNotificationClientSecretSet ? "••••••••" : ""}
        />
        <SecretInput
          label="Bot Token"
          value={discordBotToken}
          onChange={setDiscordBotToken}
          placeholder={settings.discordNotificationBotTokenSet ? "••••••••" : ""}
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Guild ID (сервер уведомлений)</span>
          <span className="block text-xs text-muted">
            ID Discord-сервера, куда добавлен бот. ПКМ по иконке сервера → «Копировать ID» (режим
            разработчика). Без этого поля бот не сможет писать в ЛС.
          </span>
          <input
            type="text"
            value={discordGuildId}
            onChange={(event) => setDiscordGuildId(event.target.value)}
            placeholder="123456789012345678"
            className={`${adminClass.input} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Invite URL (необязательно)</span>
          <span className="block text-xs text-muted">
            Постоянная ссылка <code className={adminClass.code}>discord.gg/…</code> на официальный
            сервер сайта. Если пусто — бот создаст приглашение сам (нужно право Create Invite).
          </span>
          <input
            type="text"
            value={discordInviteUrl}
            onChange={(event) => setDiscordInviteUrl(event.target.value)}
            placeholder="https://discord.gg/..."
            className={`${adminClass.input} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Bot Invite URL (необязательно)</span>
          <span className="block text-xs text-muted">
            OAuth-ссылка на добавление бота на свой сервер: Developer Portal → OAuth2 → URL
            Generator, scope <code className={adminClass.code}>bot</code>. Пользователь с ботом
            должен быть на одном сервере — альтернатива вступлению на официальный сервер.
          </span>
          <input
            type="text"
            value={discordBotInviteUrl}
            onChange={(event) => setDiscordBotInviteUrl(event.target.value)}
            placeholder="https://discord.com/oauth2/authorize?client_id=..."
            className={`${adminClass.input} w-full`}
          />
        </label>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">Шаблоны сообщений</h2>
        <p className="text-xs text-muted">
          Плейсхолдеры подставляются при отправке. В Telegram-шаблоне можно использовать HTML:{" "}
          <code className={adminClass.code}>&lt;b&gt;</code>. Ссылка на тайтл — кнопка под
          сообщением (из <code className={adminClass.code}>{`{pageUrl}`}</code>); тег{" "}
          <code className={adminClass.code}>&lt;a href=&quot;{`{pageUrl}`}&quot;&gt;</code> в
          шаблоне задаёт только текст кнопки.
        </p>
        <ul className="grid gap-1 text-xs text-muted sm:grid-cols-2">
          {NOTIFICATION_TEMPLATE_PLACEHOLDERS.map((item) => (
            <li key={item.key}>
              <code className={adminClass.code}>{item.key}</code> — {item.description}
            </li>
          ))}
        </ul>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Discord — заголовок embed</span>
          <input
            type="text"
            value={messageTemplates.discordTitle}
            onChange={(event) =>
              setMessageTemplates((prev) => ({ ...prev, discordTitle: event.target.value }))
            }
            className={`${adminClass.input} w-full`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Discord — описание embed</span>
          <textarea
            value={messageTemplates.discordDescription}
            onChange={(event) =>
              setMessageTemplates((prev) => ({ ...prev, discordDescription: event.target.value }))
            }
            rows={10}
            className={`${adminClass.input} w-full`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Telegram — текст (caption / сообщение)</span>
          <textarea
            value={messageTemplates.telegramMessage}
            onChange={(event) =>
              setMessageTemplates((prev) => ({ ...prev, telegramMessage: event.target.value }))
            }
            rows={10}
            className={`${adminClass.input} w-full font-mono text-sm`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">VK — текст сообщения</span>
          <textarea
            value={messageTemplates.vkMessage}
            onChange={(event) =>
              setMessageTemplates((prev) => ({ ...prev, vkMessage: event.target.value }))
            }
            rows={10}
            className={`${adminClass.input} w-full font-mono text-sm`}
          />
        </label>

        <button
          type="button"
          onClick={() => setMessageTemplates({ ...DEFAULT_NOTIFICATION_TEMPLATES })}
          className={adminClass.btnSecondary}
        >
          Сбросить шаблоны к умолчанию
        </button>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void saveSettings()} disabled={saving} className={adminClass.btnPrimary}>
          {saving ? "Сохранение…" : "Сохранить настройки"}
        </button>
      </div>

      {saveMessage ? (
        <p className={saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}>{saveMessage.text}</p>
      ) : null}

      <section className={`${adminClass.panel} space-y-4`}>
        <h2 className="text-lg font-semibold text-foreground">Тестовая отправка</h2>
        <p className="text-sm text-muted">
          Отправить уведомление конкретному пользователю о тайтле по Shikimori ID. Берётся озвучка из истории
          просмотра или первая доступная в Kodik.
        </p>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">Пользователь</span>
          <select
            value={testUserId}
            onChange={(event) => setTestUserId(event.target.value)}
            className={`${adminClass.input} w-full`}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nickname} (Shikimori {user.shikimoriId})
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">Shikimori ID</span>
            <input
              type="number"
              value={testShikimoriId}
              onChange={(event) => setTestShikimoriId(event.target.value)}
              className={`${adminClass.input} w-full`}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">Сезон</span>
            <input
              type="number"
              value={testSeason}
              onChange={(event) => setTestSeason(event.target.value)}
              placeholder="авто"
              className={`${adminClass.input} w-full`}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">Серия</span>
            <input
              type="number"
              value={testEpisode}
              onChange={(event) => setTestEpisode(event.target.value)}
              placeholder="авто"
              className={`${adminClass.input} w-full`}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          {(["browser", "telegram", "vk", "discord"] as const).map((channel) => (
            <label key={channel} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={testChannels[channel]}
                onChange={(event) =>
                  setTestChannels((prev) => ({ ...prev, [channel]: event.target.checked }))
                }
                className="site-checkbox"
              />
              {channel}
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void sendTest()}
          disabled={testing || !testUserId || !testShikimoriId}
          className={adminClass.btnSecondary}
        >
          {testing ? "Отправка…" : "Отправить тест"}
        </button>

        {testMessage ? (
          <pre
            className={[
              "whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
              testMessage.ok ? adminClass.alertSuccess : adminClass.alertError,
            ].join(" ")}
          >
            {testMessage.text}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
