import { StatCard } from "@/components/admin/StatCard";
import { adminClass } from "@/components/admin/admin-styles";
import { formatStorageBytes, type AdminStorageStats } from "@/lib/admin/storage-stats";

export function AdminStoragePanel({ storage }: { storage: AdminStorageStats }) {
  const mainDatabase = storage.databases[0];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Хранилище</h2>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Сайт (проект)"
          value={formatStorageBytes(storage.site.totalBytes)}
          hint={storage.site.totalBytes == null ? "На Windows считаются только части" : process.cwd()}
        />
        {storage.databases.map((db) => (
          <StatCard
            key={db.name}
            label={`База ${db.name}`}
            value={formatStorageBytes(db.bytes)}
            hint="PostgreSQL, логический размер"
          />
        ))}
        {mainDatabase ? (
          <StatCard
            label="Всего баз PostgreSQL"
            value={formatStorageBytes(
              storage.databases.reduce((sum, db) => sum + db.bytes, 0),
            )}
            hint={`${storage.databases.length} баз на инстансе`}
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${adminClass.panel} !p-0`}>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Сайт по каталогам</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={adminClass.tableHead}>
                <tr>
                  <th className="px-3 py-2">Каталог</th>
                  <th className="px-3 py-2 text-right">Размер</th>
                </tr>
              </thead>
              <tbody>
                {storage.site.breakdown.map((row) => (
                  <tr key={row.path} className={adminClass.tableRow}>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{row.label}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted">{row.path}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatStorageBytes(row.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${adminClass.panel} !p-0`}>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Таблицы PostgreSQL</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={adminClass.tableHead}>
                <tr>
                  <th className="px-3 py-2">Таблица</th>
                  <th className="px-3 py-2 text-right">Размер</th>
                </tr>
              </thead>
              <tbody>
                {storage.tables.map((row) => (
                  <tr key={row.name} className={adminClass.tableRow}>
                    <td className="px-3 py-2 font-mono text-foreground">{row.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatStorageBytes(row.bytes)}
                    </td>
                  </tr>
                ))}
                {storage.tables.length === 0 ? (
                  <tr className={adminClass.tableRow}>
                    <td colSpan={2} className="px-3 py-3 text-muted">
                      Нет данных
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
