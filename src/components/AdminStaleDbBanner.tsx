"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatRelativeRu } from "@/lib/dates";
import type { KodikDbFreshness } from "@/lib/admin/kodik-db-freshness";

type Props = {
  freshness: KodikDbFreshness | null;
  /** Принудительный показ для проверки вёрстки (только админам). */
  forcePreview?: boolean;
};

/**
 * Баннер на главной только для админов: Kodik sync не обновлял БД дольше порога.
 * Превью: `/?adminSyncBannerPreview=1`
 */
export function AdminStaleDbBanner({ freshness, forcePreview = false }: Props) {
  const { user, loading } = useAuth();

  if (loading || !user?.isAdmin) return null;

  const show = forcePreview || Boolean(freshness?.stale);
  if (!show || !freshness) return null;

  const lastLabel = freshness.lastSuccessfulSyncAt
    ? formatRelativeRu(freshness.lastSuccessfulSyncAt)
    : "никогда";

  return (
    <div
      className="mx-3 mb-5 rounded-xl border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-foreground sm:mx-6 sm:mb-6 sm:px-4 sm:py-3 lg:mx-8"
      role="alert"
    >
      <p className="font-semibold text-amber-200 dark:text-amber-100">
        {forcePreview && !freshness.stale
          ? "Превью: база Kodik давно не обновлялась"
          : "База Kodik давно не обновлялась"}
      </p>
      <p className="mt-1 text-foreground/85">
        Последний успешный sync: <span className="font-medium text-foreground">{lastLabel}</span>
        {freshness.lastSuccessfulSyncAt ? null : " (успешных запусков не было)"}. Порог —{" "}
        {freshness.staleAfterHours} ч. Проверьте cron и логи{" "}
        <code className="rounded bg-background/60 px-1 py-0.5 text-xs">kodik-sync.log</code>, затем
        синхронизацию в админке.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <Link href="/admin/import" className="font-medium text-amber-100 underline-offset-2 hover:underline">
          Импорт / sync
        </Link>
        {forcePreview ? (
          <span className="text-muted">
            Превью: уберите <code className="text-xs">?adminSyncBannerPreview=1</code>
          </span>
        ) : null}
      </div>
    </div>
  );
}
