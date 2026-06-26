import { AdminActionButton } from "@/components/admin/AdminActionButton";
import { ImportProgressPanel } from "@/components/admin/ImportProgressPanel";
import { SyncSettingsPanel } from "@/components/admin/SyncSettingsPanel";
import { adminClass } from "@/components/admin/admin-styles";
import { getImportJobStatus } from "@/lib/admin/stats";
import {
  getSyncHistory,
  getSyncSettings,
  SYNC_INTERVAL_OPTIONS,
} from "@/lib/admin/kodik-sync-settings";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const [job, settings, history] = await Promise.all([
    getImportJobStatus(),
    getSyncSettings(),
    getSyncHistory(30),
  ]);

  return (
    <div className="space-y-6">
      <ImportProgressPanel
        initialJob={job}
        pollWhenIdle={Boolean(job?.isRunning || job?.pendingEpisodes)}
      />

      <SyncSettingsPanel
        initialSettings={settings}
        initialHistory={history}
        intervalOptions={[...SYNC_INTERVAL_OPTIONS]}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Действия</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {job && job.pendingEpisodes > 0 ? (
            <AdminActionButton
              label="Продолжить импорт серий (~5 мин)"
              endpoint="/api/admin/import/episodes"
              idleHint={`Осталось ${job.pendingEpisodes.toLocaleString("ru-RU")} материалов. Прогресс обновляется автоматически.`}
            />
          ) : null}
          <AdminActionButton
            label="Запустить sync (последние обновления)"
            endpoint="/api/admin/sync"
            idleHint="Обрабатывает несколько страниц /list по updated_at. Прогресс — выше."
          />
          <AdminActionButton
            label="Backfill дат релизов"
            endpoint="/api/admin/backfill-dates"
            variant="secondary"
            idleHint="Проставляет releasedAt из kodikUpdatedAt для всех релизов."
          />
        </div>
      </section>

      <section className={`${adminClass.panel} border-dashed`}>
        <h2 className="text-lg font-semibold text-foreground">Полный импорт (CLI)</h2>
        <p className="mt-2 text-sm text-muted">
          Для длительного импорта без ограничения по времени — из терминала. Прогресс виден здесь же,
          если job в статусе running.
        </p>
        <ul className="mt-3 space-y-2 font-mono text-xs text-foreground">
          <li>
            <code className={adminClass.code}>npm run kodik:import:resume</code> — продолжить
          </li>
          <li>
            <code className={adminClass.code}>npm run kodik:import:episodes</code> — только серии
          </li>
        </ul>
      </section>
    </div>
  );
}
