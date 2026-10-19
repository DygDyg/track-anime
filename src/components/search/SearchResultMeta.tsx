import { labelKindShort, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { kindBadgeClass } from "@/lib/anime-kind-theme";
import type { SearchResultDto } from "@/lib/search-shared";

const STATUS_BADGE =
  "inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium leading-tight";
const PLAYER_BADGE_ON =
  "inline-flex rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-xs font-medium leading-tight text-accent";
const PLAYER_BADGE_OFF =
  "inline-flex rounded-md border border-border px-1.5 py-0.5 text-xs font-medium leading-tight text-muted";

export function SearchResultMeta({
  item,
  className = "",
}: {
  item: SearchResultDto;
  className?: string;
}) {
  const kindLabel = labelKindShort(item.kind);
  const kindClass = kindBadgeClass(item.kind);
  const statusLabel = labelStatus(item.status);
  const statusClass = statusBadgeClass(item.status);
  const playerBadge = (
    <span className={item.hasPlayer ? PLAYER_BADGE_ON : PLAYER_BADGE_OFF}>
      {item.hasPlayer ? "Плеер" : "Нет плеера"}
    </span>
  );

  const hasMeta =
    item.year ||
    kindLabel ||
    statusLabel ||
    (item.episodes != null && item.episodes > 0);

  if (!hasMeta) {
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()}>
        <span className="text-sm text-muted">Аниме</span>
        {playerBadge}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()}>
      {item.year ? <span className="text-sm text-muted">{item.year}</span> : null}
      {kindLabel && kindClass ? (
        <span className={kindClass}>{kindLabel}</span>
      ) : kindLabel ? (
        <span className="text-sm text-muted">{kindLabel}</span>
      ) : null}
      {statusLabel ? (
        <span className={[STATUS_BADGE, statusClass ?? "border-border text-muted"].join(" ")}>
          {statusLabel}
        </span>
      ) : null}
      {item.episodes != null && item.episodes > 0 ? (
        <span className="text-sm text-muted">{item.episodes} эп.</span>
      ) : null}
      {playerBadge}
    </div>
  );
}
