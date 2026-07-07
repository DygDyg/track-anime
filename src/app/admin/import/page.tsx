import { AdminActionButton } from "@/components/admin/AdminActionButton";
import { ImportProgressPanel } from "@/components/admin/ImportProgressPanel";
import { ShikimoriAnonsSyncPanel } from "@/components/admin/ShikimoriAnonsSyncPanel";
import { SyncSettingsPanel } from "@/components/admin/SyncSettingsPanel";
import { adminClass } from "@/components/admin/admin-styles";
import { getImportJobStatus } from "@/lib/admin/stats";
import {
  getSyncHistory,
  getSyncSettings,
  SYNC_INTERVAL_OPTIONS,
} from "@/lib/admin/kodik-sync-settings";
import { getShikimoriAnonsSyncStatus } from "@/lib/admin/shikimori-anons-sync";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const [job, settings, history, anonsStatus] = await Promise.all([
    getImportJobStatus(),
    getSyncSettings(),
    getSyncHistory(30),
    getShikimoriAnonsSyncStatus(),
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

      <ShikimoriAnonsSyncPanel initialStatus={anonsStatus} />

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
          Для длительного импорта без ограничения по времени — из терминала на сервере. Прогресс
          виден здесь же, если job в статусе running.
        </p>
        <ul className="mt-3 space-y-2 font-mono text-xs text-foreground">
          <li>
            <code className={adminClass.code}>npm run kodik:import:resume</code> — продолжить
          </li>
          <li>
            <code className={adminClass.code}>npm run kodik:import:episodes</code> — только серии
          </li>
          <li>
            <code className={adminClass.code}>npm run shikimori:sync-anons</code> — анонсы для
            календаря
          </li>
        </ul>

        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">Рекомендация: запуск в screen</h3>
          <p className="mt-2 text-sm text-muted">
            Долгие команды лучше запускать в{" "}
            <code className={adminClass.code}>screen</code>, чтобы процесс не оборвался при закрытии
            SSH. На production каталог приложения —{" "}
            <code className={adminClass.code}>/var/www/ta_new</code>.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              Подключитесь к серверу и перейдите в каталог:{" "}
              <code className={adminClass.code}>cd /var/www/ta_new</code>
            </li>
            <li>
              Создайте сессию:{" "}
              <code className={adminClass.code}>screen -S import</code> (имя на выбор:{" "}
              <code className={adminClass.code}>import</code>,{" "}
              <code className={adminClass.code}>anons</code> и т.п.)
            </li>
            <li>
              Запустите нужную команду из списка выше, например{" "}
              <code className={adminClass.code}>npm run kodik:import:resume</code>
            </li>
            <li>
              Отсоединитесь, не останавливая процесс:{" "}
              <code className={adminClass.code}>Ctrl+A</code>, затем{" "}
              <code className={adminClass.code}>D</code>
            </li>
            <li>
              Вернуться к выводу:{" "}
              <code className={adminClass.code}>screen -r import</code> (или{" "}
              <code className={adminClass.code}>screen -ls</code>, если забыли имя сессии)
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            Для первого импорта с нуля —{" "}
            <code className={adminClass.code}>npm run kodik:import</code>. Анонсы можно гнать
            отдельной сессией:{" "}
            <code className={adminClass.code}>screen -S anons</code> →{" "}
            <code className={adminClass.code}>npm run shikimori:sync-anons</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
