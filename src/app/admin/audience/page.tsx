import { AudienceDayChart } from "@/components/admin/AudienceDayChart";
import {
  AudienceBreakdownTable,
  AudienceSectionTable,
  AudienceTitlesTable,
} from "@/components/admin/AudienceBreakdownTable";
import { AudienceStatsMarkdownExportButton } from "@/components/admin/AudienceStatsMarkdownExportButton";
import { StatCard } from "@/components/admin/StatCard";
import { WatchPartyStatsPanel } from "@/components/admin/WatchPartyStatsPanel";
import { WatchShareLogPanel } from "@/components/admin/WatchShareLogPanel";
import { adminClass } from "@/components/admin/admin-styles";
import { getAudienceStats } from "@/lib/admin/audience-stats";
import { getNotificationSubscriptionStats } from "@/lib/admin/notification-subscription-stats";
import { getWatchPartyHistoryDto } from "@/lib/admin/watch-party-history";
import { getAnimeWatchShareLogDto } from "@/lib/admin/watch-share-log";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Аналитика",
};

export default async function AdminAudiencePage() {
  const [stats, watchPartyHistory, notificationStats, watchShareLog] = await Promise.all([
    getAudienceStats(),
    getWatchPartyHistoryDto(50),
    getNotificationSubscriptionStats(),
    getAnimeWatchShareLogDto(50),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Учёт через cookie <code className={adminClass.code}>ta.vid</code>. IP не используется —
          люди за одним VPN не склеиваются. Один аккаунт с разных браузеров считается одним человеком
          после входа. Клик по заголовку столбца сортирует таблицу.
        </p>
        <AudienceStatsMarkdownExportButton />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Сводка</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="DAU (сегодня)" value={stats.dau} />
          <StatCard label="WAU (7 дней)" value={stats.wau} />
          <StatCard label="MAU (30 дней)" value={stats.mau} />
          <StatCard label="Сейчас онлайн (~15 мин)" value={stats.activeNow} />
          <StatCard label="Устройства (cookie)" value={stats.totalIdentities} />
          <StatCard label="С аккаунтом" value={stats.registeredIdentities} />
          <StatCard label="Гости (без логина)" value={stats.guestIdentities} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Плееры</h2>
        <p className="mb-4 text-sm text-muted">
          Уникальные зрители и запуски за 30 дней по балансеру на странице тайтла (Kodik/TA vs
          VideoHUB). Учёт с момента деплоя этой метрики; старые play без поля player считаются как
          Kodik/TA.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Kodik / TA — люди"
            value={stats.playerKodik.people}
            hint={`запусков: ${stats.playerKodik.hits.toLocaleString("ru-RU")}`}
          />
          <StatCard
            label="VideoHUB — люди"
            value={stats.playerCvh.people}
            hint={`запусков: ${stats.playerCvh.hits.toLocaleString("ru-RU")}`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Уведомления</h2>
        <p className="mb-4 text-sm text-muted">
          Каналы считаются активными при включённом «Новое в истории» и рабочей привязке / токене.
          Отдельно — сколько аккаунтов просто привязали соцсеть.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Тип: новое в истории"
            value={notificationStats.historyNewEnabled}
            hint="historyNewEnabled"
          />
          <StatCard
            label="Telegram"
            value={notificationStats.telegram}
            hint={`привязано: ${notificationStats.telegramLinked}`}
          />
          <StatCard
            label="VK"
            value={notificationStats.vk}
            hint={`привязано: ${notificationStats.vkLinked}`}
          />
          <StatCard
            label="Discord"
            value={notificationStats.discord}
            hint={`привязано: ${notificationStats.discordLinked}, DM ок: ${notificationStats.discordDmVerified}`}
          />
          <StatCard
            label="Браузерный push"
            value={notificationStats.browser}
            hint="есть PushSubscription"
          />
          <StatCard
            label="Android FCM"
            value={notificationStats.fcm}
            hint="есть FCM-токен"
          />
        </div>
      </section>

      <AudienceDayChart days={stats.days} />

      <section className="grid gap-4 lg:grid-cols-3">
        <AudienceBreakdownTable title="Клиент" rows={stats.byClientKind} />
        <AudienceBreakdownTable title="ОС" rows={stats.byOs} />
        <AudienceBreakdownTable title="Браузер / оболочка" rows={stats.byBrowser} />
      </section>

      <section className="space-y-2">
        <AudienceBreakdownTable
          title="Модели телефонов / устройств (30 дней)"
          rows={stats.byDeviceModel}
          countLabel="Устр."
        />
        <p className="text-xs text-muted">
          Модель: бренд + модель (APK — Build.MANUFACTURER/MODEL; браузер — Client Hints / UA, бренд
          часто угадывается по коду вроде SM-…). Safari/iOS обычно «Apple iPhone».
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AudienceSectionTable
          title="Разделы (30 дней)"
          rows={stats.topSections.map((s) => ({
            label: s.label,
            hits: s.hits,
            uniques: s.uniques,
          }))}
        />
        <AudienceTitlesTable
          title="Топ тайтлов — открытия (30 дней)"
          hint="Открытие страницы /anime/[id], без обязательного play."
          rows={stats.topTitles}
        />
        <AudienceTitlesTable
          title="Топ тайтлов — воспроизведение (30 дней)"
          hint="Только когда пользователь запустил серию (play / video_started)."
          rows={stats.topPlayTitles}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ссылки на просмотр</h2>
          <p className="mt-1 text-sm text-muted">
            Лог копирования deep-link (плеер, сезон, серия, озвучка, таймкод, nosave).
          </p>
        </div>
        <WatchShareLogPanel initialLog={watchShareLog} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Совместный просмотр</h2>
          <p className="mt-1 text-sm text-muted">
            Активные комнаты и история запусков — тот же блок, что на странице настроек совместного
            просмотра.
          </p>
        </div>
        <WatchPartyStatsPanel initialHistory={watchPartyHistory} />
      </section>
    </div>
  );
}
