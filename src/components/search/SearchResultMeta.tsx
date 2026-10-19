import { labelKindShort, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { kindBadgeClass } from "@/lib/anime-kind-theme";
import type { SearchResultDto } from "@/lib/search-shared";

const STATUS_BADGE =
  "inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium leading-tight";
const NO_PLAYER_BADGE =
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
  const noPlayerBadge = !item.hasPlayer ? (
    <span className={NO_PLAYER_BADGE}>Нет плеера</span>
  ) : null;

  const hasMeta =
    item.year ||
    kindLabel ||
    statusLabel ||
    (item.episodes != null && item.episodes > 0) ||
    noPlayerBadge;

  if (!hasMeta) {
    return <p className={`text-sm text-muted ${className}`.trim()}>Аниме</p>;
  }

  if (
    !item.year &&
    !kindLabel &&
    !statusLabel &&
    !(item.episodes != null && item.episodes > 0) &&
    noPlayerBadge
  ) {
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()}>
        <span className="text-sm text-muted">Аниме</span>
        {noPlayerBadge}
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
      {noPlayerBadge}
    </div>
  );
}
