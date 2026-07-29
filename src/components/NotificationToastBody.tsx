"use client";

import Link from "next/link";
import { TranslationBadge } from "@/components/TranslationBadge";
import { buildEpisodeLabel } from "@/lib/notifications/templates";
import type { NotificationToastItem } from "@/lib/notifications/toast-ui";

function ToastPoster({ toast }: { toast: NotificationToastItem }) {
  if (!toast.posterUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ephemeral toast; cover API URL
    <img
      src={toast.posterUrl}
      alt=""
      width={48}
      height={72}
      className="h-[4.5rem] w-12 shrink-0 rounded-md object-cover bg-muted/40"
      loading="lazy"
      decoding="async"
    />
  );
}

export function NotificationToastBody({
  toast,
  className,
}: {
  toast: NotificationToastItem;
  className?: string;
}) {
  if (toast.kind === "digest") {
    return (
      <Link href={toast.url} className={className}>
        <div className="min-w-0 flex-1 py-0.5 pr-0.5">
          <p className="text-sm font-semibold leading-snug text-foreground">{toast.title}</p>
          {toast.body ? (
            <p className="mt-0.5 text-xs leading-snug text-muted">{toast.body}</p>
          ) : null}
        </div>
      </Link>
    );
  }

  const episodeLabel = buildEpisodeLabel(toast.seasonNumber ?? 1, toast.episodeNumber ?? 1);

  return (
    <Link href={toast.url} className={className}>
      <ToastPoster toast={toast} />
      <div className="min-w-0 flex-1 py-0.5 pr-0.5">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {toast.animeTitle ?? toast.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-snug text-muted">
          <span>{episodeLabel}</span>
          {toast.translationName ? (
            <>
              <span aria-hidden>·</span>
              <TranslationBadge name={toast.translationName} className="text-[11px]" />
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
