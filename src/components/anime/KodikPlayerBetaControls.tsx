"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { KodikPlayerPlaybackState } from "@/components/anime/KodikPlayer";
import { formatWatchPosition } from "@/lib/watch-history";

export type KodikPlayerBetaTheaterMode = "normal" | "height";

type Props = {
  disabled?: boolean;
  playback: KodikPlayerPlaybackState;
  fullscreenActive: boolean;
  seekSkipLabelSeconds: number;
  onPlayPause: () => void;
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  previousEpisodeDisabled?: boolean;
  nextEpisodeDisabled?: boolean;
  onSeek: (seconds: number) => void;
  onSeekSkip: (deltaSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  theaterMode: KodikPlayerBetaTheaterMode;
  onTheaterToggle: () => void;
  onFullscreenToggle: () => void;
  pipAvailable?: boolean;
  onPictureInPicture?: () => void;
  castAvailable?: boolean;
  onCast?: () => void;
  onFullscreenTranslationsToggle?: () => void;
  fullscreenTranslationsOpen?: boolean;
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

function IconPreviousEpisode() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M6 5h2v14H6V5zm3 7 9 7V5l-9 7z" />
    </svg>
  );
}

function IconNextEpisode() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M16 5h2v14h-2V5zM6 5v14l9-7-9-7z" />
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

function IconTheater({ mode }: { mode: KodikPlayerBetaTheaterMode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      {mode === "height" ? (
        <path d="M5 3h14v18H5V3zm2 5v8h10V8H7z" />
      ) : (
        <path d="M4 7h16v10H4V7zm2 2v6h12V9H6zm1-6h10v2H7V3zm0 16h10v2H7v-2z" />
      )}
    </svg>
  );
}

function IconPictureInPicture() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm6 5h5v4h-5v-4z" />
    </svg>
  );
}

function IconCast() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M3 6h18v9h-2V8H5v2H3V6zm0 11c1.1 0 2 .9 2 2H3v-2zm0-4c3.31 0 6 2.69 6 6H7c0-2.21-1.79-4-4-4v-2zm0-4c5.52 0 10 4.48 10 10h-2c0-4.42-3.58-8-8-8V9z" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z" />
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
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/90 transition",
        "select-none hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
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
  fullscreenActive,
  seekSkipLabelSeconds,
  onPlayPause,
  onPreviousEpisode,
  onNextEpisode,
  previousEpisodeDisabled = false,
  nextEpisodeDisabled = false,
  onSeek,
  onSeekSkip,
  onVolumeChange,
  onMuteToggle,
  theaterMode,
  onTheaterToggle,
  onFullscreenToggle,
  pipAvailable = false,
  onPictureInPicture,
  castAvailable = false,
  onCast,
  onFullscreenTranslationsToggle,
  fullscreenTranslationsOpen = false,
  overlay = false,
}: Props) {
  const duration = Math.max(playback.durationSeconds, 0);
  const position = Math.min(Math.max(playback.positionSeconds, 0), duration || playback.positionSeconds);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const progressDraggingRef = useRef(false);
  const dragStartPositionRef = useRef(position);
  const dragLatestPositionRef = useRef(position);
  const displayedPosition = dragPosition ?? position;
  const progressReady = duration > 0;
  const progressMax = duration > 0 ? duration : Math.max(position, 1);
  const volumeLow = !playback.muted && playback.volume < 0.5;
  const progressPercent = (displayedPosition / progressMax) * 100;
  const progressFill = `${progressPercent}%`;
  const volumeValue = playback.muted ? 0 : playback.volume;
  const volumeFill = `${volumeValue * 100}%`;
  const theaterLabel =
    theaterMode === "normal"
      ? "По высоте экрана"
      : "Обычный размер";
  const dragDeltaSeconds =
    dragPosition == null ? 0 : Math.round(dragPosition - dragStartPositionRef.current);
  const dragPositionLabel = formatWatchPosition(displayedPosition);
  const wheelDirection = (event: ReactWheelEvent<HTMLElement>) =>
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const handleSeekSkipButton = (deltaSeconds: number) => {
    onSeekSkip(deltaSeconds);
  };
  const commitProgressDrag = () => {
    if (!progressDraggingRef.current) return;
    progressDraggingRef.current = false;
    const next = dragLatestPositionRef.current;
    setDragPosition(null);
    onSeek(next);
  };
  const cancelProgressDrag = () => {
    progressDraggingRef.current = false;
    setDragPosition(null);
    dragLatestPositionRef.current = position;
  };
  const handleProgressPointerDown = (value: number) => {
    if (disabled || !progressReady) return;
    progressDraggingRef.current = true;
    dragStartPositionRef.current = position;
    dragLatestPositionRef.current = value;
    setDragPosition(value);
  };
  const handleProgressChange = (value: number) => {
    if (!progressReady) return;
    if (!progressDraggingRef.current) {
      onSeek(value);
      return;
    }
    dragLatestPositionRef.current = value;
    setDragPosition(value);
  };
  const handleProgressWheel = (event: ReactWheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!progressReady) return;
    const delta = wheelDirection(event);
    if (delta === 0) return;
    onSeekSkip(delta > 0 ? 10 : -10);
  };
  const handleVolumeWheel = (event: ReactWheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = wheelDirection(event);
    if (delta === 0) return;
    const next = volumeValue + (delta < 0 ? 0.05 : -0.05);
    onVolumeChange(Math.min(1, Math.max(0, next)));
  };
  const handleVolumeGroupWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = wheelDirection(event);
    if (delta === 0) return;
    const next = volumeValue + (delta < 0 ? 0.05 : -0.05);
    onVolumeChange(Math.min(1, Math.max(0, next)));
  };

  return (
    <div
      className={[
        "kodik-player-beta-controls relative px-2 py-1.5 text-white sm:px-3",
        overlay
          ? "kodik-player-beta-controls--overlay rounded-none border-0 pb-2"
          : "rounded-b-lg border border-t-0 border-border bg-[#0f0f0f]",
      ].join(" ")}
    >
      <div className="mb-1 flex h-1.5 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {dragPosition != null ? (
            <span
              className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 shadow-lg backdrop-blur-sm"
              style={{ left: progressFill }}
            >
              {dragPositionLabel}
            </span>
          ) : null}
          <input
            type="range"
            min={0}
            max={progressMax}
            step={1}
            value={displayedPosition}
            disabled={disabled || !progressReady}
            aria-label="Прогресс воспроизведения"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              handleProgressPointerDown(Number(event.currentTarget.value));
            }}
            onPointerUp={commitProgressDrag}
            onPointerCancel={cancelProgressDrag}
            onBlur={commitProgressDrag}
            onKeyUp={commitProgressDrag}
            onChange={(event) => handleProgressChange(Number(event.target.value))}
            onWheel={handleProgressWheel}
            style={{ "--range-fill": progressFill } as CSSProperties}
            className="kodik-player-beta-range kodik-player-beta-progress site-range h-1.5 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        <ControlButton
          label={playback.isPlaying ? "Пауза" : "Воспроизведение"}
          disabled={disabled}
          onClick={onPlayPause}
        >
          {playback.isPlaying ? <IconPause /> : <IconPlay />}
        </ControlButton>

        {onPreviousEpisode ? (
          <ControlButton
            label="Предыдущая серия"
            disabled={disabled || previousEpisodeDisabled}
            onClick={onPreviousEpisode}
          >
            <IconPreviousEpisode />
          </ControlButton>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleSeekSkipButton(-seekSkipLabelSeconds)}
          className="select-none rounded-md px-2 py-1 text-xs font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −{seekSkipLabelSeconds}
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleSeekSkipButton(seekSkipLabelSeconds)}
          className="select-none rounded-md px-2 py-1 text-xs font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +{seekSkipLabelSeconds}
        </button>

        {onNextEpisode ? (
          <ControlButton
            label="Следующая серия"
            disabled={disabled || nextEpisodeDisabled}
            onClick={onNextEpisode}
          >
            <IconNextEpisode />
          </ControlButton>
        ) : null}

        {progressReady ? (
          <span className="hidden min-w-[7.5rem] shrink-0 tabular-nums text-xs text-white/75 sm:inline">
            {formatWatchPosition(position)} / {formatWatchPosition(duration)}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-2" onWheel={handleVolumeGroupWheel}>
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
              onWheel={handleVolumeWheel}
              style={{ "--range-fill": volumeFill } as CSSProperties}
              className="kodik-player-beta-range kodik-player-beta-volume site-range hidden w-20 cursor-pointer sm:block"
            />
          </div>

          {pipAvailable && onPictureInPicture ? (
            <ControlButton
              label="Картинка в картинке"
              disabled={disabled}
              onClick={onPictureInPicture}
            >
              <IconPictureInPicture />
            </ControlButton>
          ) : null}

          {castAvailable && onCast ? (
            <ControlButton label="Транслировать на ТВ" disabled={disabled} onClick={onCast}>
              <IconCast />
            </ControlButton>
          ) : null}

          <ControlButton
            label={theaterLabel}
            disabled={disabled}
            pressed={theaterMode !== "normal"}
            onClick={onTheaterToggle}
          >
            <IconTheater mode={theaterMode} />
          </ControlButton>

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
      {fullscreenActive && onFullscreenTranslationsToggle ? (
        <button
          type="button"
          onClick={onFullscreenTranslationsToggle}
          className="kodik-player-beta-translations-toggle absolute bottom-1 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/45 backdrop-blur-sm transition hover:bg-white/10 hover:text-white/75"
          aria-label={fullscreenTranslationsOpen ? "Скрыть озвучки" : "Показать озвучки"}
          title={fullscreenTranslationsOpen ? "Скрыть озвучки" : "Показать озвучки"}
        >
          {fullscreenTranslationsOpen ? <IconChevronUp /> : <IconChevronDown />}
          <span>Озвучки</span>
        </button>
      ) : null}
    </div>
  );
}
