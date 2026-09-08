import { adminClass } from "@/components/admin/admin-styles";
import type { AudienceDayPoint } from "@/lib/admin/audience-stats";

export function AudienceDayChart({ days }: { days: AudienceDayPoint[] }) {
  const max = Math.max(1, ...days.map((d) => d.identities));

  return (
    <div className={adminClass.panel}>
      <p className={adminClass.statLabel}>Уникальные посетители по дням (UTC)</p>
      <div className="mt-4 flex h-40 items-end gap-1">
        {days.map((d) => {
          const h = Math.round((d.identities / max) * 100);
          return (
            <div key={d.day} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end">
              <div
                className="admin-progress-fill w-full rounded-t-sm"
                style={{ height: `${Math.max(h, d.identities > 0 ? 4 : 0)}%` }}
                title={`${d.day}: ${d.identities} чел., ${d.hits} хитов`}
              />
              <span className="mt-1 hidden text-[9px] text-muted sm:block">
                {d.day.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Наведите на столбец — дата, люди и хиты.</p>
    </div>
  );
}
