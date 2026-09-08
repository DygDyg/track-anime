import Link from "next/link";
import { AudienceDayChart } from "@/components/admin/AudienceDayChart";
import { AudienceBreakdownTable } from "@/components/admin/AudienceBreakdownTable";
import { StatCard } from "@/components/admin/StatCard";
import { adminClass } from "@/components/admin/admin-styles";
import { getAudienceStats } from "@/lib/admin/audience-stats";

export const dynamic = "force-dynamic";

export default async function AdminAudiencePage() {
  const stats = await getAudienceStats();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Учёт через cookie <code className={adminClass.code}>ta.vid</code>. IP не используется — люди
        за одним VPN не склеиваются. Один аккаунт с разных браузеров считается одним человеком после
        входа.
      </p>

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

      <AudienceDayChart days={stats.days} />

      <section className="grid gap-4 lg:grid-cols-3">
        <AudienceBreakdownTable title="Клиент" rows={stats.byClientKind} />
        <AudienceBreakdownTable title="ОС" rows={stats.byOs} />
        <AudienceBreakdownTable title="Браузер / оболочка" rows={stats.byBrowser} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AudienceBreakdownTable
          title="Разделы (30 дней, хиты)"
          rows={stats.topSections.map((s) => ({
            label: `${s.label} · ${s.uniques} уник.`,
            count: s.hits,
          }))}
          countLabel="Хиты"
        />
        <div className={adminClass.panel}>
          <p className="mb-3 text-sm font-semibold text-foreground">Топ тайтлов (30 дней)</p>
          {stats.topTitles.length === 0 ? (
            <p className="text-sm text-muted">Пока нет данных.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={adminClass.tableHead}>
                    <th className="py-2 pr-3 font-medium">Тайтл</th>
                    <th className="py-2 pr-3 font-medium">Хиты</th>
                    <th className="py-2 font-medium">Уник.</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topTitles.map((row) => (
                    <tr key={row.shikimoriId} className={adminClass.tableRow}>
                      <td className="py-2 pr-3">
                        <Link href={`/anime/${row.shikimoriId}`} className={adminClass.textLink}>
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{row.hits}</td>
                      <td className="py-2 tabular-nums">{row.uniques}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
