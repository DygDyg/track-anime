import type { AudienceStats } from "@/lib/admin/audience-stats";
import type { NotificationSubscriptionStats } from "@/lib/admin/notification-subscription-stats";
import type { WatchPartyHistoryDto } from "@/lib/admin/watch-party-history";

const BAR_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;
const BAR_WIDTH = 24;

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

function unicodeBar(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "";
  const units = Math.max(1, Math.round((value / max) * BAR_WIDTH * 8));
  const full = Math.floor(units / 8);
  const rem = units % 8;
  return `${"█".repeat(full)}${BAR_BLOCKS[rem] ?? ""}`;
}

function formatDayLabel(isoDay: string): string {
  // YYYY-MM-DD → DD.MM
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;
  return `${isoDay.slice(8)}.${isoDay.slice(5, 7)}`;
}

function formatDateTimeRu(date: Date): string {
  return date.toLocaleString("ru-RU", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export type AudienceStatsMarkdownInput = {
  stats: AudienceStats;
  notifications: NotificationSubscriptionStats;
  watchParty: WatchPartyHistoryDto;
  generatedAt?: Date;
};

/** Красивый Markdown-отчёт по странице /admin/audience. */
export function formatAudienceStatsMarkdown(input: AudienceStatsMarkdownInput): string {
  const { stats, notifications, watchParty } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const maxDay = Math.max(1, ...stats.days.map((d) => d.identities));
  const activeRooms = watchParty.sessions.filter((s) => s.active).length;
  const endedRooms = watchParty.sessions.length - activeRooms;

  const lines: string[] = [
    `# Track Anime — статистика аудитории`,
    ``,
    `> Снимок на **${formatDateTimeRu(generatedAt)} UTC**`,
    `>`,
    `> Учёт через cookie \`ta.vid\`. IP не используется. Один аккаунт с разных браузеров`,
    `> считается одним человеком после входа.`,
    ``,
    `---`,
    ``,
    `## Сводка`,
    ``,
    mdTable(
      ["Метрика", "Значение"],
      [
        ["DAU (сегодня)", fmt(stats.dau)],
        ["WAU (7 дней)", fmt(stats.wau)],
        ["MAU (30 дней)", fmt(stats.mau)],
        ["Сейчас онлайн (~15 мин)", fmt(stats.activeNow)],
        ["Устройства (cookie)", fmt(stats.totalIdentities)],
        ["С аккаунтом", fmt(stats.registeredIdentities)],
        ["Гости (без логина)", fmt(stats.guestIdentities)],
      ],
    ),
    ``,
    `## Плееры (30 дней)`,
    ``,
    mdTable(
      ["Плеер", "Люди", "Запуски"],
      [
        ["Kodik / TA", fmt(stats.playerKodik.people), fmt(stats.playerKodik.hits)],
        ["VideoHUB", fmt(stats.playerCvh.people), fmt(stats.playerCvh.hits)],
      ],
    ),
    ``,
    `## Уведомления`,
    ``,
    mdTable(
      ["Канал / тип", "Активных", "Примечание"],
      [
        ["Тип: новое в истории", fmt(notifications.historyNewEnabled), "`historyNewEnabled`"],
        [
          "Telegram",
          fmt(notifications.telegram),
          `привязано: ${fmt(notifications.telegramLinked)}`,
        ],
        ["VK", fmt(notifications.vk), `привязано: ${fmt(notifications.vkLinked)}`],
        [
          "Discord",
          fmt(notifications.discord),
          `привязано: ${fmt(notifications.discordLinked)}, DM ок: ${fmt(notifications.discordDmVerified)}`,
        ],
        ["Браузерный push", fmt(notifications.browser), "есть PushSubscription"],
        ["Android FCM", fmt(notifications.fcm), "есть FCM-токен"],
      ],
    ),
    ``,
    `## Уникальные посетители по дням (UTC)`,
    ``,
    `Столбик: снизу зарегистрированные, сверху гости. Шкала относительно максимума дня.`,
    ``,
    mdTable(
      ["День", "Всего", "С аккаунтом", "Гости", "Хиты", "График"],
      stats.days.map((d) => [
        formatDayLabel(d.day),
        fmt(d.identities),
        fmt(d.registered),
        fmt(d.guests),
        fmt(d.hits),
        unicodeBar(d.identities, maxDay) || "·",
      ]),
    ),
    ``,
    `## Клиент`,
    ``,
    mdTable(
      ["Клиент", "Устр."],
      stats.byClientKind.map((r) => [escapeCell(r.label), fmt(r.count)]),
    ),
    ``,
    `## ОС`,
    ``,
    mdTable(
      ["ОС", "Устр."],
      stats.byOs.map((r) => [escapeCell(r.label), fmt(r.count)]),
    ),
    ``,
    `## Браузер / оболочка`,
    ``,
    mdTable(
      ["Браузер", "Устр."],
      stats.byBrowser.map((r) => [escapeCell(r.label), fmt(r.count)]),
    ),
    ``,
    `## Модели телефонов / устройств (30 дней)`,
    ``,
    mdTable(
      ["Модель", "Устр."],
      stats.byDeviceModel.map((r) => [escapeCell(r.label), fmt(r.count)]),
    ),
    ``,
    `## Разделы (30 дней)`,
    ``,
    mdTable(
      ["Раздел", "Хиты", "Уники"],
      stats.topSections.map((s) => [escapeCell(s.label), fmt(s.hits), fmt(s.uniques)]),
    ),
    ``,
    `## Топ тайтлов — открытия (30 дней)`,
    ``,
    mdTable(
      ["#", "Тайтл", "Shikimori", "Хиты", "Уники"],
      stats.topTitles.map((t, i) => [
        String(i + 1),
        escapeCell(t.title),
        String(t.shikimoriId),
        fmt(t.hits),
        fmt(t.uniques),
      ]),
    ),
    ``,
    `## Топ тайтлов — воспроизведение (30 дней)`,
    ``,
    mdTable(
      ["#", "Тайтл", "Shikimori", "Хиты", "Уники"],
      stats.topPlayTitles.map((t, i) => [
        String(i + 1),
        escapeCell(t.title),
        String(t.shikimoriId),
        fmt(t.hits),
        fmt(t.uniques),
      ]),
    ),
    ``,
    `## Совместный просмотр`,
    ``,
    mdTable(
      ["Метрика", "Значение"],
      [
        ["Сессий в выборке", fmt(watchParty.sessions.length)],
        ["Активных сейчас", fmt(activeRooms)],
        ["Завершённых в выборке", fmt(endedRooms)],
      ],
    ),
    ``,
  ];

  if (watchParty.sessions.length > 0) {
    lines.push(`### Последние сессии`, ``);
    lines.push(
      mdTable(
        ["Когда (UTC)", "Статус", "Тайтл", "Серия", "Озвучка", "Участники", "Создатель"],
        watchParty.sessions.slice(0, 30).map((s) => [
          formatDateTimeRu(new Date(s.createdAt)),
          s.active ? "активна" : "завершена",
          escapeCell(s.animeTitle ?? `shiki:${s.shikimoriId}`),
          `S${s.seasonNumber} · E${s.episodeNumber}`,
          escapeCell(s.translationTitle ?? "—"),
          fmt(s.participants.length),
          escapeCell(s.creatorNickname),
        ]),
      ),
    );
    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `_Сгенерировано админкой Track Anime · вкладка «Аналитика» · \`/admin/audience\`_`,
    ``,
  );

  return lines.join("\n");
}

export function audienceStatsMarkdownFilename(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `track-anime-audience-${y}${m}${d}-${hh}${mm}-utc.md`;
}
