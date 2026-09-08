import Link from "next/link";
import { AdminSiteVersionPanel } from "@/components/admin/AdminSiteVersionPanel";
import { AdminStoragePanel } from "@/components/admin/AdminStoragePanel";
import { StatCard } from "@/components/admin/StatCard";
import { ImportProgressPanel } from "@/components/admin/ImportProgressPanel";
import { adminClass } from "@/components/admin/admin-styles";
import { getAudienceStats } from "@/lib/admin/audience-stats";
import { getAdminDashboardStats } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [stats, audience] = await Promise.all([getAdminDashboardStats(), getAudienceStats({ chartDays: 1 })]);

  return (
    <div className="space-y-6">
      <AdminSiteVersionPanel build={stats.build} />

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Каталог</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Тайтлов в ленте" value={stats.releases} />
          <StatCard label="Материалов Kodik" value={stats.materials} />
          <StatCard label="Эпизодов" value={stats.episodes} />
          <StatCard label="Релизов за 24 ч" value={stats.releasesLast24h} />
          <StatCard label="Без серий" value={stats.pendingEpisodes} hint="episodesLoaded = false" />
          <StatCard label="Без Shikimori ID" value={stats.materialsWithoutShikimori} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Пользователи</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Зарегистрировано" value={stats.users} />
          <StatCard label="Активных сессий" value={stats.activeSessions} />
          <StatCard label="DAU (гости+аккаунты)" value={audience.dau} />
          <StatCard label="Онлайн (~15 мин)" value={audience.activeNow} />
          <StatCard label="MAU (30 дней)" value={audience.mau} />
        </div>
        <p className="mt-3 text-sm">
          <Link href="/admin/audience" className={adminClass.textLink}>
            Аудитория и платформы →
          </Link>
        </p>
      </section>

      <AdminStoragePanel storage={stats.storage} />

      {stats.importJob ? (
        <ImportProgressPanel initialJob={stats.importJob} pollWhenIdle={stats.importJob.isRunning} />
      ) : null}

      <p className="text-sm">
        <Link href="/admin/import" className={adminClass.textLink}>
          Управление импортом →
        </Link>
      </p>
    </div>
  );
}
