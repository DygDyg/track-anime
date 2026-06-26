import { RelativeTime } from "@/components/RelativeTime";
import { StatCard } from "@/components/admin/StatCard";
import { adminClass } from "@/components/admin/admin-styles";
import type { SiteBuildInfo } from "@/lib/admin/build-info";

export function AdminSiteVersionPanel({ build }: { build: SiteBuildInfo }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Версия сайта</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Версия"
          value={`v${build.version}`}
          hint={build.buildNumber != null ? `package.json · сборка #${build.buildNumber}` : "package.json"}
        />
        <StatCard
          label="Сборка"
          value={build.buildNumber != null ? `#${build.buildNumber}` : "—"}
          hint="Увеличивается при каждом деплое"
        />
        <StatCard
          label="Собрано / залито"
          value={build.builtAtLabel ?? "—"}
          hint={build.builtAt ? "UTC+локальное время сервера" : "Запустите npm run build"}
        />
        <div className={adminClass.panel}>
          <p className={adminClass.statLabel}>Прошло времени</p>
          <p className={adminClass.statValue}>
            {build.builtAt ? <RelativeTime date={build.builtAt} /> : "—"}
          </p>
          {build.builtAt ? (
            <p className="mt-1 text-xs text-muted">Обновляется каждую минуту</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
