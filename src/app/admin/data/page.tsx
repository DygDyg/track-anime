import { adminClass } from "@/components/admin/admin-styles";
import { getDataQualityStats } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  const data = await getDataQualityStats();

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className={adminClass.panel}>
          <p className={adminClass.statLabel}>Без Shikimori ID</p>
          <p className={adminClass.statValue}>{data.materialsWithoutShikimori}</p>
        </div>
        <div className={adminClass.panel}>
          <p className={adminClass.statLabel}>Без загруженных серий</p>
          <p className={adminClass.statValue}>{data.pendingEpisodes}</p>
        </div>
        <div className={adminClass.panel}>
          <p className={adminClass.statLabel}>Shikimori-кэш</p>
          <p className={adminClass.statValue}>{data.stubMaterials}</p>
        </div>
      </section>

      <section className={`${adminClass.panel} !p-0`}>
        <div className="border-b border-border px-4 py-4">
          <h2 className="text-lg font-semibold text-foreground">Недавно обновлённые на Kodik</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className={adminClass.tableHead}>
              <tr>
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2">Shikimori</th>
                <th className="px-3 py-2">Серии</th>
                <th className="px-3 py-2">Kodik updated</th>
              </tr>
            </thead>
            <tbody>
              {data.recentMaterials.map((row) => (
                <tr key={row.kodikId} className={adminClass.tableRow}>
                  <td className="max-w-xs truncate px-3 py-2 font-medium text-foreground">
                    {row.title}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">{row.shikimoriId ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{row.episodesLoaded ? "да" : "нет"}</td>
                  <td className="px-3 py-2 text-muted">
                    {row.kodikUpdatedAt
                      ? new Date(row.kodikUpdatedAt).toLocaleString("ru-RU")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
