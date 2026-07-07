import { WatchEpisodeProgress } from "@/components/WatchEpisodeProgress";

type HistoryWatchProgressBlockProps = {
  hint: string;
  percent: number;
  positionSeconds?: number;
  durationSeconds?: number;
  episodeNumber?: number;
  className?: string;
};

export function HistoryWatchProgressBlock({
  hint,
  percent,
  positionSeconds,
  durationSeconds,
  episodeNumber,
  className = "",
}: HistoryWatchProgressBlockProps) {
  return (
    <div className={["home-history-watch-block", className].join(" ")}>
      <p className="home-history-watch-block__hint">{hint}</p>
      <WatchEpisodeProgress
        percent={percent}
        positionSeconds={positionSeconds}
        durationSeconds={durationSeconds}
        episodeNumber={episodeNumber}
        showLabels={positionSeconds != null && durationSeconds != null}
      />
    </div>
  );
}
