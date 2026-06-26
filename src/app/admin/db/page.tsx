import { AdminDbExplorer } from "@/components/admin/AdminDbExplorer";
import { getDbTableCounts } from "@/lib/admin/db-explorer";

export const dynamic = "force-dynamic";

export default async function AdminDbPage() {
  const tableCounts = await getDbTableCounts();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">База данных</h2>
        <p className="mt-1 text-sm text-muted">
          Просмотр и поиск по таблицам. Только чтение, без произвольного SQL.
        </p>
      </div>
      <AdminDbExplorer tableCounts={tableCounts} />
    </div>
  );
}
