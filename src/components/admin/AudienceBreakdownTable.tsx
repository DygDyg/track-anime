import { adminClass } from "@/components/admin/admin-styles";

export function AudienceBreakdownTable({
  title,
  rows,
  countLabel = "Кол-во",
}: {
  title: string;
  rows: { label: string; count: number }[];
  countLabel?: string;
}) {
  return (
    <div className={adminClass.panel}>
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Пока нет данных.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={adminClass.tableHead}>
                <th className="py-2 pr-3 font-medium">Название</th>
                <th className="py-2 font-medium">{countLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className={adminClass.tableRow}>
                  <td className="py-2 pr-3 text-foreground">{row.label}</td>
                  <td className="py-2 tabular-nums text-foreground">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
