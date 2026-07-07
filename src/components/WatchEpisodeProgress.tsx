import { formatWatchPosition } from "@/lib/watch-history";

type WatchEpisodeProgressProps = {
  percent: number;
  positionSeconds?: number;
  durationSeconds?: number;
  episodeNumber?: number;
  className?: string;
  showLabels?: boolean;
};

export function WatchEpisodeProgress({
  percent,
  positionSeconds,
  durationSeconds,
  episodeNumber,
  className = "",
  showLabels = true,
}: WatchEpisodeProgressProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const ariaLabel =
    episodeNumber != null
      ? `Просмотрено ${clampedPercent}% серии ${episodeNumber}`
      : `Просмотрено ${clampedPercent}%`;

  return (
    <div className={["space-y-1", className].join(" ")}>
      {showLabels && positionSeconds != null && durationSeconds != null ? (
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
          <span>
            {formatWatchPosition(positionSeconds)} / {formatWatchPosition(durationSeconds)}
          </span>
          <span>{clampedPercent}%</span>
        </div>
      ) : null}
      <div className="episode-progress">
        <div
          className="episode-progress-bar"
          style={{ width: `${clampedPercent}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampedPercent}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}
