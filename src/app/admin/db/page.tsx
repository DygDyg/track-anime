import { AdminDbExplorer } from "@/components/admin/AdminDbExplorer";
import { DbBackupSettingsPanel } from "@/components/admin/DbBackupSettingsPanel";
import { formatBytes, getDbBackupHistory, listDbBackupTables } from "@/lib/admin/db-backup";
import {
  DB_BACKUP_INTERVAL_HOURS_OPTIONS,
  DB_BACKUP_MAX_FILE_BYTES_OPTIONS,
  getDbBackupSettingsDto,
} from "@/lib/admin/db-backup-settings";
import { getDbTableCounts } from "@/lib/admin/db-explorer";

export const dynamic = "force-dynamic";

export default async function AdminDbPage() {
  const [tableCounts, settings, history] = await Promise.all([
    getDbTableCounts(),
    getDbBackupSettingsDto(),
    getDbBackupHistory(30),
  ]);
  const tables = await listDbBackupTables(settings.includedTables);
  const selectedBytes = tables.filter((t) => t.enabled).reduce((sum, t) => sum + t.bytes, 0);
  const totalBytes = tables.reduce((sum, t) => sum + t.bytes, 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">База данных</h2>
        <p className="mt-1 text-sm text-muted">
          Просмотр и поиск по таблицам. Бекап выбранных таблиц на WebDAV-облако.
        </p>
      </div>

      <DbBackupSettingsPanel
        initialSettings={settings}
        initialTables={tables}
        initialTotals={{
          tableCount: tables.length,
          selectedCount: tables.filter((t) => t.enabled).length,
          totalBytes,
          selectedBytes,
          totalBytesLabel: formatBytes(totalBytes),
          selectedBytesLabel: formatBytes(selectedBytes),
        }}
        initialHistory={history}
        intervalHoursOptions={[...DB_BACKUP_INTERVAL_HOURS_OPTIONS]}
        maxFileBytesOptions={[...DB_BACKUP_MAX_FILE_BYTES_OPTIONS]}
      />

      <div>
        <h2 className="text-lg font-semibold text-foreground">Просмотр таблиц</h2>
        <p className="mt-1 text-sm text-muted">Только чтение, без произвольного SQL.</p>
        <div className="mt-4">
          <AdminDbExplorer tableCounts={tableCounts} />
        </div>
      </div>
    </div>
  );
}
