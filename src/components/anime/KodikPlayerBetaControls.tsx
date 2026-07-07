"use client";

import type { CSSProperties, ReactNode } from "react";
import type { KodikPlayerPlaybackState } from "@/components/anime/KodikPlayer";
import type { KodikStreamQuality } from "@/lib/kodik-player-quality";
import { formatWatchPosition } from "@/lib/watch-history";

type Props = {
  disabled?: boolean;
  playback: KodikPlayerPlaybackState;
  qualities: KodikStreamQuality[];
  currentQuality: string | null;
  fullscreenActive: boolean;
  seekSkipLabelSeconds: number;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onSeekSkip: (deltaSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onQualityChange: (quality: KodikStreamQuality) => void;
  onFullscreenToggle: () => void;
  overlay?: boolean;
};

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function IconVolume({ muted, low }: { muted: boolean; low: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  if (low) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M7 9v6h4l5 5V4l-5 5H7z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function IconFullscreen({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M5 16h3v3H5v-3zm3-8H5v3h3V8zm8 8h3v3h-3v-3zm0-8V5h3v3h-3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

function ControlButton({
  children,
  label,
  disabled,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/90 transition",
        "hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
        pressed ? "bg-white/15" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function KodikPlayerBetaControls({
  disabled = false,
  playback,
  qualities,
  currentQuality,
  fullscreenActive,
  seekSkipLabelSeconds,
  onPlayPause,
  onSeek,
  onSeekSkip,
  onVolumeChange,
  onMuteToggle,
  onQualityChange,
  onFullscreenToggle,
  overlay = false,
}: Props) {
  const duration = Math.max(playback.durationSeconds, 0);
  const position = Math.min(Math.max(playback.positionSeconds, 0), duration || playback.positionSeconds);
  const progressMax = duration > 0 ? duration : Math.max(position, 1);
  const volumeLow = !playback.muted && playback.volume < 0.5;
  const progressFill = `${(position / progressMax) * 100}%`;
  const volumeValue = playback.muted ? 0 : playback.volume;
  const volumeFill = `${volumeValue * 100}%`;

  return (
    <div
      className={[
        "kodik-player-beta-controls px-2 py-2 text-white sm:px-3",
        overlay
          ? "kodik-player-beta-controls--overlay rounded-none border-0 pb-2.5"
          : "rounded-b-lg border border-t-0 border-border bg-[#0f0f0f]",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={progressMax}
          step={1}
          value={position}
          disabled={disabled}
          aria-label="Прогресс воспроизведения"
          onChange={(event) => onSeek(Number(event.target.value))}
          style={{ "--range-fill": progressFill } as CSSProperties}
          className="kodik-player-beta-range kodik-player-beta-progress site-range h-1.5 min-w-0 flex-1 cursor-pointer"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        <ControlButton
          label={playback.isPlaying ? "Пауза" : "Воспроизведение"}
          disabled={disabled}
          onClick={onPlayPause}
        >
          {playback.isPlaying ? <IconPause /> : <IconPlay />}
        </ControlButton>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onSeekSkip(-(seekSkipLabelSeconds - 2))}
          className="rounded-md px-2 py-1 text-xs font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −{seekSkipLabelSeconds}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSeekSkip(seekSkipLabelSeconds - 2)}
          className="rounded-md px-2 py-1 text-xs font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +{seekSkipLabelSeconds}
        </button>

        <span className="hidden min-w-[7.5rem] shrink-0 tabular-nums text-xs text-white/75 sm:inline">
          {formatWatchPosition(position)}
          {duration > 0 ? ` / ${formatWatchPosition(duration)}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ControlButton
            label={playback.muted ? "Включить звук" : "Выключить звук"}
            disabled={disabled}
            onClick={onMuteToggle}
          >
            <IconVolume muted={playback.muted} low={volumeLow} />
          </ControlButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumeValue}
            disabled={disabled}
            aria-label="Громкость"
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            style={{ "--range-fill": volumeFill } as CSSProperties}
            className="kodik-player-beta-range kodik-player-beta-volume site-range hidden w-20 cursor-pointer sm:block"
          />

          <label className="sr-only" htmlFor="kodik-beta-quality">
            Качество видео
          </label>
          <select
            id="kodik-beta-quality"
            disabled={disabled}
            value={currentQuality ?? qualities[0] ?? "720p"}
            onChange={(event) => onQualityChange(event.target.value as KodikStreamQuality)}
            className="max-w-[6.5rem] rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white outline-none ring-accent/40 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {qualities.map((quality) => (
              <option key={quality} value={quality}>
                {quality}
              </option>
            ))}
          </select>

          <ControlButton
            label={fullscreenActive ? "Выйти из полноэкранного режима" : "На весь экран"}
            disabled={disabled}
            pressed={fullscreenActive}
            onClick={onFullscreenToggle}
          >
            <IconFullscreen active={fullscreenActive} />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
