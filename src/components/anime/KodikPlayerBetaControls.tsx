"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { KodikPlayerPlaybackState } from "@/components/anime/KodikPlayer";
import { formatWatchPosition } from "@/lib/watch-history";
import {
  DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS,
  PLAYER_AMBIENT_GLOW_BLUR_DEFAULT,
  PLAYER_AMBIENT_GLOW_BLUR_MAX,
  PLAYER_AMBIENT_GLOW_BLUR_MIN,
  PLAYER_AMBIENT_GLOW_BLUR_STEP,
  PLAYER_AMBIENT_GLOW_BRIGHTNESS_DEFAULT,
  PLAYER_AMBIENT_GLOW_BRIGHTNESS_MAX,
  PLAYER_AMBIENT_GLOW_BRIGHTNESS_MIN,
  PLAYER_AMBIENT_GLOW_BRIGHTNESS_STEP,
  PLAYER_AMBIENT_GLOW_DOWNSCALE_DEFAULT,
  PLAYER_AMBIENT_GLOW_DOWNSCALE_MAX,
  PLAYER_AMBIENT_GLOW_DOWNSCALE_MIN,
  PLAYER_AMBIENT_GLOW_DOWNSCALE_STEP,
  PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT,
  PLAYER_AMBIENT_GLOW_OPACITY_MAX,
  PLAYER_AMBIENT_GLOW_OPACITY_MIN,
  PLAYER_AMBIENT_GLOW_OPACITY_STEP,
  PLAYER_AMBIENT_GLOW_PRESETS,
  PLAYER_AMBIENT_GLOW_SATURATE_DEFAULT,
  PLAYER_AMBIENT_GLOW_SATURATE_MAX,
  PLAYER_AMBIENT_GLOW_SATURATE_MIN,
  PLAYER_AMBIENT_GLOW_SATURATE_STEP,
  PLAYER_AMBIENT_GLOW_SCALE_DEFAULT,
  PLAYER_AMBIENT_GLOW_SCALE_MAX,
  PLAYER_AMBIENT_GLOW_SCALE_MIN,
  PLAYER_AMBIENT_GLOW_SCALE_STEP,
  PLAYER_AMBIENT_GLOW_UPDATE_MS_DEFAULT,
  PLAYER_AMBIENT_GLOW_UPDATE_MS_MAX,
  PLAYER_AMBIENT_GLOW_UPDATE_MS_MIN,
  PLAYER_AMBIENT_GLOW_UPDATE_MS_STEP,
  applyAmbientGlowPreset,
  type PlayerAmbientGlowPresetId,
  type PlayerAmbientGlowSettings,
} from "@/lib/player-ambient-glow";
import { PLAYER_CONTROLS_IDLE_MS_DEFAULT } from "@/lib/site-settings";
import {
  resolveTaPlusTilePreview,
  taPlusTilePreviewStyle,
  type TaPlusTiles,
} from "@/lib/ta-plus-tiles";
import type { TaPlusVideoFit } from "@/lib/ta-plus-video-fit-preferences";

export type KodikPlayerBetaTheaterMode = "normal" | "height";

export type KodikPlayerTimelineSegment = {
  type: "op" | "ed" | "mixed-op" | "mixed-ed";
  startTime: number;
  endTime: number;
};

type Props = {
  disabled?: boolean;
  playback: KodikPlayerPlaybackState;
  timelineSegments?: KodikPlayerTimelineSegment[];
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
  interactive?: boolean;
  /** True when controls are docked below the player (portrait mobile). */
  controlsDocked?: boolean;
  /** Idle delay used to collapse the quality gap while paused (ms). */
  qualityPanelIdleMs?: number;
  /** Fires when the quality gap is open after pressing «Авто». */
  onQualityPanelActiveChange?: (active: boolean) => void;
  /** Mark bottom-bar play as TV primary focus when «Продолжить» is absent. */
  tvBarPlayPrimary?: boolean;
  /** Label on the quality button (default «Авто»). */
  qualityLabel?: string;
  /**
   * External quality menu (TA Plus HLS): button toggles without opening the Kodik click-gap.
   * When set, `qualityPressed` controls aria-pressed.
   */
  onQualityClick?: () => void;
  qualityPressed?: boolean;
  /** Buffered end ratio 0–1 for scrubber (TA Plus). */
  bufferedRatio?: number | null;
  /** Storyboard tiles for scrub preview (TA Plus). */
  tiles?: TaPlusTiles | null;
  playbackRates?: number[];
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  /** TA Plus ambient glow — only when display AR > 16:9. */
  ambientGlowAvailable?: boolean;
  ambientGlowSettings?: PlayerAmbientGlowSettings;
  onAmbientGlowSettingsChange?: (patch: Partial<PlayerAmbientGlowSettings>) => void;
  /** TA Plus video fit (contain/cover) — hidden for Kodik iframe. */
  videoFitAvailable?: boolean;
  videoFit?: TaPlusVideoFit;
  /** When ambient glow is runtime-active, cover would hide pillarbox glow. */
  videoFitDisabled?: boolean;
  onVideoFitToggle?: () => void;
};

type RangeStyle = CSSProperties & {
  "--range-fill"?: string;
  "--range-buffer"?: string;
  "--range-skip-segments"?: string;
};

const DEFAULT_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

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

function IconVideoFit({ fit }: { fit: TaPlusVideoFit }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      {fit === "cover" ? (
        /* Fill frame — arrows outward from inner rect */
        <path d="M7 7h10v10H7V7zm2 2v6h6V9H9zM3 8h2v8H3V8zm16 0h2v8h-2V8zM8 3h8v2H8V3zm0 16h8v2H8v-2z" />
      ) : (
        /* Fit inside — arrows inward */
        <path d="M5 5h14v14H5V5zm2 2v10h10V7H7zM3 9h2v6H3V9zm16 0h2v6h-2V9zM9 3h6v2H9V3zm0 16h6v2H9v-2z" />
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

function IconAmbientGlow() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0 8a3 3 0 110-6 3 3 0 010 6z" />
      <path d="M11 1h2v3h-2V1zm0 19h2v3h-2v-3zM1 11h3v2H1v-2zm19 0h3v2h-3v-2zM4.22 3.81l1.42-1.41 2.12 2.12-1.41 1.42-2.13-2.13zm12.02 12.02 2.12 2.12-1.41 1.42-2.12-2.12 1.41-1.42zM3.81 19.78l2.12-2.12 1.42 1.41-2.13 2.13-1.41-1.42zm12.02-12.02 1.41-1.42 2.13 2.13-1.42 1.41-2.12-2.12z" />
    </svg>
  );
}

function IconAmbientGlowReset() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

function AmbientGlowRange({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  defaultValue,
  disabled,
  ariaLabel,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  defaultValue: number;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  const isDefault = Math.abs(value - defaultValue) < step * 0.5 + 1e-6;
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5">
      <span className="w-[4.75rem] shrink-0 truncate text-[11px] text-white/65" title={label}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        className="kodik-player-beta-range site-range min-w-0 flex-1 cursor-pointer disabled:opacity-40"
        style={{ "--range-fill": `${fill}%` } as CSSProperties}
      />
      <span className="w-[2.75rem] shrink-0 text-right text-[10px] tabular-nums text-white/55">
        {valueLabel}
      </span>
      <button
        type="button"
        disabled={disabled || isDefault}
        title="Сбросить на значение по умолчанию"
        aria-label={`Сбросить «${label}» на значение по умолчанию`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange(defaultValue)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/55 transition hover:bg-white/10 hover:text-white/90 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <IconAmbientGlowReset />
      </button>
    </div>
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
  className = "",
  tvBarPlay,
  tvPrimary,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
  className?: string;
  /** Bottom-bar play/pause — TV primary / bar focus target. */
  tvBarPlay?: boolean;
  /** Also mark as data-tv-player-primary (no Continue overlay). */
  tvPrimary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      data-tv-player-bar-play={tvBarPlay ? true : undefined}
      data-tv-player-primary={tvPrimary ? true : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={[
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/90 transition sm:h-9 sm:w-9",
        "select-none hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
        pressed ? "bg-white/15" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function timelineSegmentColor(type: KodikPlayerTimelineSegment["type"]): string {
  switch (type) {
    case "op":
    case "mixed-op":
      return "rgba(52, 211, 153, 0.56)";
    case "ed":
    case "mixed-ed":
      return "rgba(251, 191, 36, 0.6)";
  }
}

export function buildTimelineSegmentBackground(
  segments: KodikPlayerTimelineSegment[],
  duration: number,
): string | undefined {
  if (duration <= 0 || segments.length === 0) return undefined;

  const gradients = segments
    .map((segment) => {
      const start = Math.max(0, Math.min(duration, segment.startTime));
      const end = Math.max(0, Math.min(duration, segment.endTime));
      if (end <= start) return null;

      const startPercent = (start / duration) * 100;
      const endPercent = (end / duration) * 100;
      return [
        "linear-gradient(to right,",
        `transparent 0%, transparent ${startPercent.toFixed(3)}%,`,
        `${timelineSegmentColor(segment.type)} ${startPercent.toFixed(3)}%,`,
        `${timelineSegmentColor(segment.type)} ${endPercent.toFixed(3)}%,`,
        `transparent ${endPercent.toFixed(3)}%, transparent 100%)`,
      ].join(" ");
    })
    .filter(Boolean);

  return gradients.length > 0 ? gradients.join(", ") : undefined;
}

export function KodikPlayerBetaControls({
  disabled = false,
  playback,
  timelineSegments = [],
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
  interactive = true,
  controlsDocked = false,
  qualityPanelIdleMs = PLAYER_CONTROLS_IDLE_MS_DEFAULT,
  onQualityPanelActiveChange,
  tvBarPlayPrimary = false,
  qualityLabel = "Авто",
  onQualityClick,
  qualityPressed = false,
  bufferedRatio = null,
  tiles = null,
  playbackRates = DEFAULT_PLAYBACK_RATES,
  playbackRate = 1,
  onPlaybackRateChange,
  ambientGlowAvailable = false,
  ambientGlowSettings,
  onAmbientGlowSettingsChange,
  videoFitAvailable = false,
  videoFit = "contain",
  videoFitDisabled = false,
  onVideoFitToggle,
}: Props) {
  const duration = Math.max(playback.durationSeconds, 0);
  const position = Math.min(Math.max(playback.positionSeconds, 0), duration || playback.positionSeconds);
  const [qualityTapOpen, setQualityTapOpen] = useState(false);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const [ambientMenuOpen, setAmbientMenuOpen] = useState(false);
  const externalQuality = typeof onQualityClick === "function";
  const qualityOpen = externalQuality ? qualityPressed : qualityTapOpen;
  const qualitySplit = !externalQuality && !controlsDocked && playback.mediaUnlocked && qualityTapOpen;
  const ambientEnabled = ambientGlowSettings?.enabled === true;

  useEffect(() => {
    // Click-through to Kodik only while «Авто» keeps the quality gap open.
    const passthrough =
      !externalQuality && !controlsDocked && playback.mediaUnlocked && qualityTapOpen;
    onQualityPanelActiveChange?.(passthrough);
  }, [
    controlsDocked,
    externalQuality,
    playback.mediaUnlocked,
    qualityTapOpen,
    onQualityPanelActiveChange,
  ]);

  // While playing, chrome auto-hide collapses the gap via `interactive`.
  useEffect(() => {
    if (!interactive && qualityTapOpen) {
      setQualityTapOpen(false);
    }
    if (!interactive && rateMenuOpen) {
      setRateMenuOpen(false);
    }
    if (!interactive && ambientMenuOpen) {
      setAmbientMenuOpen(false);
    }
  }, [interactive, qualityTapOpen, rateMenuOpen, ambientMenuOpen]);

  // While paused, chrome stays visible — collapse the gap after the same idle delay.
  useEffect(() => {
    if (!qualityTapOpen || playback.isPlaying || externalQuality) return;
    const timer = window.setTimeout(() => setQualityTapOpen(false), qualityPanelIdleMs);
    return () => window.clearTimeout(timer);
  }, [qualityTapOpen, playback.isPlaying, qualityPanelIdleMs, externalQuality]);

  useEffect(() => {
    if (!rateMenuOpen || playback.isPlaying) return;
    const timer = window.setTimeout(() => setRateMenuOpen(false), qualityPanelIdleMs);
    return () => window.clearTimeout(timer);
  }, [rateMenuOpen, playback.isPlaying, qualityPanelIdleMs]);

  useEffect(() => {
    if (!ambientMenuOpen || playback.isPlaying) return;
    const timer = window.setTimeout(() => setAmbientMenuOpen(false), qualityPanelIdleMs);
    return () => window.clearTimeout(timer);
  }, [ambientMenuOpen, playback.isPlaying, qualityPanelIdleMs]);

  const openAmbientGlowSettings = useCallback(() => {
    setRateMenuOpen(false);
    setAmbientMenuOpen((open) => {
      const next = !open;
      if (next && !ambientEnabled) {
        onAmbientGlowSettingsChange?.({ enabled: true });
      }
      return next;
    });
  }, [ambientEnabled, onAmbientGlowSettingsChange]);

  const handleQualityTap = useCallback(() => {
    if (!playback.mediaUnlocked) return;
    if (externalQuality) {
      onQualityClick?.();
      return;
    }
    setQualityTapOpen((prev) => !prev);
  }, [externalQuality, onQualityClick, playback.mediaUnlocked]);

  const qualityButton = !controlsDocked ? (
      <button
        type="button"
        disabled={disabled || !playback.mediaUnlocked}
        aria-label={qualityOpen ? "Закрыть выбор качества" : "Качество видео"}
        aria-pressed={qualityOpen}
        title={
          externalQuality
            ? qualityOpen
              ? "Закрыть выбор качества"
              : "Выбрать качество видео"
            : qualityOpen
              ? "Закрыть выбор качества Kodik"
              : "Качество видео — нажмите, чтобы открыть меню Kodik"
        }
        onClick={handleQualityTap}
        onMouseDown={(e) => e.preventDefault()}
        className={[
          "kodik-player-beta-quality-button inline-flex h-10 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition select-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:text-xs",
          playback.mediaUnlocked
            ? [
                "cursor-pointer hover:bg-white/15 active:scale-95",
                qualityOpen ? "bg-white/15 text-white" : "text-white/80",
              ].join(" ")
            : "cursor-default text-white/40",
        ].join(" ")}
        style={{ width: "clamp(2.5rem, 6vw, 5rem)" }}
      >
        {qualityLabel}
      </button>
    ) : null;

  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [volumeSliderActive, setVolumeSliderActive] = useState(false);
  const progressDraggingRef = useRef(false);
  const dragStartPositionRef = useRef(position);
  const dragLatestPositionRef = useRef(position);
  const displayedPosition = dragPosition ?? position;
  const previewPosition = dragPosition ?? hoverPosition;
  const progressReady = duration > 0;
  /** Volume needs a live media element; don't unlock just because scrub has a duration hint. */
  const volumeDisabled = disabled || !playback.mediaUnlocked;
  const progressMax = duration > 0 ? duration : Math.max(position, 1);
  const volumeLow = !playback.muted && playback.volume < 0.5;
  const progressPercent = (displayedPosition / progressMax) * 100;
  const progressFill = `${progressPercent}%`;
  const volumeValue = playback.muted ? 0 : playback.volume;
  const volumeFill = `${volumeValue * 100}%`;
  const timelineSegmentBackground = buildTimelineSegmentBackground(timelineSegments, duration);
  const bufferFill =
    bufferedRatio != null && Number.isFinite(bufferedRatio)
      ? `${Math.min(100, Math.max(0, bufferedRatio * 100))}%`
      : undefined;
  const progressRangeStyle: RangeStyle = {
    "--range-fill": progressFill,
    ...(bufferFill ? { "--range-buffer": bufferFill } : {}),
    ...(timelineSegmentBackground ? { "--range-skip-segments": timelineSegmentBackground } : {}),
  };
  const tilePreview =
    previewPosition != null && tiles
      ? resolveTaPlusTilePreview(tiles, previewPosition)
      : null;
  const previewFill =
    previewPosition != null && progressMax > 0
      ? `${Math.min(100, Math.max(0, (previewPosition / progressMax) * 100))}%`
      : progressFill;
  const previewTimeLabel =
    previewPosition != null
      ? formatWatchPosition(previewPosition)
      : formatWatchPosition(displayedPosition);
  const theaterLabel =
    theaterMode === "normal"
      ? "По высоте экрана"
      : "Обычный размер";
  const videoFitLabel = videoFitDisabled
    ? "Недоступно при подсветке"
    : videoFit === "contain"
      ? "Заполнить кадр"
      : "Вписать в кадр";
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
    if (volumeDisabled) return;
    const delta = wheelDirection(event);
    if (delta === 0) return;
    const next = volumeValue + (delta < 0 ? 0.05 : -0.05);
    onVolumeChange(Math.min(1, Math.max(0, next)));
  };
  const handleVolumeGroupWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (volumeDisabled) return;
    const delta = wheelDirection(event);
    if (delta === 0) return;
    const next = volumeValue + (delta < 0 ? 0.05 : -0.05);
    onVolumeChange(Math.min(1, Math.max(0, next)));
  };

  const panelClass = overlay
    ? "rounded-[0.75rem] border border-white/[0.12] bg-black/50 backdrop-blur-[12px]"
    : "bg-[#0f0f0f]";

  const formatPlaybackRate = (rate: number) =>
    Number.isInteger(rate) ? `${rate}×` : `${rate.toLocaleString("ru-RU")}×`;

  const progressValueFromClientX = (clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * progressMax;
  };

  const progressBar = (
    <>
      <div className="mb-1 flex h-1.5 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {previewPosition != null && (tilePreview || dragPosition != null) ? (
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-1.5 flex -translate-x-1/2 flex-col items-center gap-1"
              style={{ left: previewFill }}
            >
              {tilePreview && tiles ? (
                <div
                  className="overflow-hidden rounded-md border border-white/25 bg-black/85 shadow-xl"
                  style={{
                    ...taPlusTilePreviewStyle(
                      {
                        ...tilePreview,
                        cellWidth: Math.max(160, tilePreview.cellWidth),
                        cellHeight: Math.max(90, tilePreview.cellHeight),
                      },
                      tiles,
                    ),
                    width: Math.max(160, tilePreview.cellWidth),
                    height: Math.max(90, tilePreview.cellHeight),
                  }}
                />
              ) : null}
              <span className="rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 shadow-lg backdrop-blur-sm">
                {previewTimeLabel}
              </span>
            </div>
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
            onPointerMove={(event) => {
              if (!tiles || !progressReady || disabled) return;
              if (progressDraggingRef.current) return;
              setHoverPosition(progressValueFromClientX(event.clientX, event.currentTarget));
            }}
            onPointerLeave={() => {
              if (!progressDraggingRef.current) setHoverPosition(null);
            }}
            style={progressRangeStyle}
            className="kodik-player-beta-range kodik-player-beta-progress site-range h-1.5 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          />
        </div>
      </div>
      {progressReady ? (
        <div className="kodik-player-beta-mobile-time mb-1 flex justify-between text-[11px] font-medium tabular-nums text-white/70 sm:hidden">
          <span>{formatWatchPosition(position)}</span>
          <span>{formatWatchPosition(duration)}</span>
        </div>
      ) : null}
    </>
  );

  const leftControls = (
    <>
      <ControlButton
        label={
          !playback.mediaUnlocked
            ? "Нажмите на видео, чтобы начать"
            : playback.isPlaying
              ? "Пауза"
              : "Воспроизведение"
        }
        disabled={disabled || !playback.mediaUnlocked}
        onClick={onPlayPause}
        tvBarPlay
        tvPrimary={tvBarPlayPrimary}
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
        aria-label={`Назад на ${seekSkipLabelSeconds} секунд`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleSeekSkipButton(-seekSkipLabelSeconds)}
        className="kodik-player-beta-seek-button h-10 select-none rounded-md px-2 py-1 text-xs font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto"
      >
        −{seekSkipLabelSeconds}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Вперёд на ${seekSkipLabelSeconds} секунд`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleSeekSkipButton(seekSkipLabelSeconds)}
        className="kodik-player-beta-seek-button h-10 select-none rounded-md px-2 py-1 text-xs font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto"
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

      <div className="kodik-player-beta-controls-actions ml-auto flex items-center gap-1 sm:gap-2">
        <div
          className="kodik-player-beta-volume-group flex items-center gap-1 sm:gap-2"
          data-volume-expanded={volumeSliderActive ? "true" : undefined}
          onWheel={handleVolumeGroupWheel}
        >
          <ControlButton
            label={playback.muted ? "Включить звук" : "Выключить звук"}
            disabled={volumeDisabled}
            onClick={onMuteToggle}
          >
            <IconVolume muted={playback.muted} low={volumeLow} />
          </ControlButton>
          <span className="kodik-player-beta-volume-slider-wrap">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumeValue}
              disabled={volumeDisabled}
              aria-label="Громкость"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setVolumeSliderActive(true);
              }}
              onPointerUp={() => setVolumeSliderActive(false)}
              onPointerCancel={() => setVolumeSliderActive(false)}
              onBlur={() => setVolumeSliderActive(false)}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              onWheel={handleVolumeWheel}
              style={{ "--range-fill": volumeFill } as CSSProperties}
              className="kodik-player-beta-range kodik-player-beta-volume site-range cursor-pointer"
            />
          </span>
        </div>

        {onPlaybackRateChange ? (
          <div className="relative shrink-0">
            <ControlButton
              label={
                rateMenuOpen
                  ? "Закрыть выбор скорости"
                  : `Скорость ${formatPlaybackRate(playbackRate)}`
              }
              disabled={disabled || !playback.mediaUnlocked}
              pressed={rateMenuOpen}
              onClick={() => {
                setAmbientMenuOpen(false);
                setRateMenuOpen((open) => !open);
              }}
              className="kodik-player-beta-rate-button text-[11px] font-semibold tabular-nums sm:text-xs"
            >
              {formatPlaybackRate(playbackRate)}
            </ControlButton>
            {rateMenuOpen ? (
              <div
                className="absolute bottom-full right-0 z-50 mb-2 min-w-[6.5rem] rounded-lg border border-white/15 bg-black/80 p-1.5 shadow-xl backdrop-blur-md"
                role="listbox"
                aria-label="Скорость воспроизведения"
              >
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  Скорость
                </p>
                <ul className="flex flex-col gap-0.5">
                  {playbackRates.map((rate) => {
                    const active = Math.abs(rate - playbackRate) < 0.001;
                    return (
                      <li key={rate}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onPlaybackRateChange(rate);
                            setRateMenuOpen(false);
                          }}
                          className={[
                            "w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium tabular-nums transition",
                            active
                              ? "bg-white/15 text-white"
                              : "text-white/75 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          {formatPlaybackRate(rate)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

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

        {ambientGlowAvailable && ambientGlowSettings && onAmbientGlowSettingsChange ? (
          <div className="relative shrink-0">
            <ControlButton
              label={
                ambientMenuOpen
                  ? "Закрыть настройки подсветки"
                  : ambientEnabled
                    ? "Настройки подсветки по краям"
                    : "Подсветка по краям"
              }
              disabled={disabled}
              pressed={ambientMenuOpen || ambientEnabled}
              onClick={openAmbientGlowSettings}
              className="kodik-player-beta-ambient-glow-button"
            >
              <IconAmbientGlow />
            </ControlButton>
            {ambientMenuOpen ? (
              <div
                className="absolute bottom-full right-0 z-50 mb-2 max-h-[min(70vh,22rem)] w-[17.5rem] overflow-y-auto rounded-lg border border-white/15 bg-black/85 p-2 shadow-xl backdrop-blur-md"
                role="dialog"
                aria-label="Настройки подсветки"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p className="px-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  Подсветка
                </p>
                <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-1.5 text-xs text-white/90 hover:bg-white/5">
                  <span>Включена</span>
                  <input
                    type="checkbox"
                    checked={ambientEnabled}
                    onChange={(event) =>
                      onAmbientGlowSettingsChange({ enabled: event.target.checked })
                    }
                    className="h-4 w-4 accent-white"
                  />
                </label>

                <label className="mb-2 block px-1">
                  <span className="mb-1 block text-[11px] text-white/65">Пресет</span>
                  <select
                    value=""
                    disabled={!ambientEnabled}
                    aria-label="Пресет подсветки"
                    onChange={(event) => {
                      const id = event.target.value as PlayerAmbientGlowPresetId;
                      if (!id) return;
                      onAmbientGlowSettingsChange(
                        applyAmbientGlowPreset(ambientGlowSettings, id),
                      );
                      event.currentTarget.value = "";
                    }}
                    className="w-full rounded-md border border-white/15 bg-black/60 px-2 py-1.5 text-xs text-white disabled:opacity-40"
                  >
                    <option value="" disabled>
                      Выбрать…
                    </option>
                    {PLAYER_AMBIENT_GLOW_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="px-0.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                  Внешний вид
                </p>
                <AmbientGlowRange
                  label="Размытие"
                  valueLabel={`${Math.round(ambientGlowSettings.blur)}px`}
                  min={PLAYER_AMBIENT_GLOW_BLUR_MIN}
                  max={PLAYER_AMBIENT_GLOW_BLUR_MAX}
                  step={PLAYER_AMBIENT_GLOW_BLUR_STEP}
                  value={ambientGlowSettings.blur}
                  defaultValue={PLAYER_AMBIENT_GLOW_BLUR_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Размытие подсветки"
                  onChange={(blur) => onAmbientGlowSettingsChange({ blur })}
                />
                <AmbientGlowRange
                  label="Непрозрачность"
                  valueLabel={`${Math.round(ambientGlowSettings.opacity * 100)}%`}
                  min={PLAYER_AMBIENT_GLOW_OPACITY_MIN}
                  max={PLAYER_AMBIENT_GLOW_OPACITY_MAX}
                  step={PLAYER_AMBIENT_GLOW_OPACITY_STEP}
                  value={ambientGlowSettings.opacity}
                  defaultValue={PLAYER_AMBIENT_GLOW_OPACITY_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Непрозрачность подсветки"
                  onChange={(opacity) => onAmbientGlowSettingsChange({ opacity })}
                />
                <AmbientGlowRange
                  label="Яркость"
                  valueLabel={`${ambientGlowSettings.brightness.toFixed(2)}×`}
                  min={PLAYER_AMBIENT_GLOW_BRIGHTNESS_MIN}
                  max={PLAYER_AMBIENT_GLOW_BRIGHTNESS_MAX}
                  step={PLAYER_AMBIENT_GLOW_BRIGHTNESS_STEP}
                  value={ambientGlowSettings.brightness}
                  defaultValue={PLAYER_AMBIENT_GLOW_BRIGHTNESS_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Яркость подсветки"
                  onChange={(brightness) => onAmbientGlowSettingsChange({ brightness })}
                />
                <AmbientGlowRange
                  label="Насыщенность"
                  valueLabel={`${ambientGlowSettings.saturate.toFixed(1)}×`}
                  min={PLAYER_AMBIENT_GLOW_SATURATE_MIN}
                  max={PLAYER_AMBIENT_GLOW_SATURATE_MAX}
                  step={PLAYER_AMBIENT_GLOW_SATURATE_STEP}
                  value={ambientGlowSettings.saturate}
                  defaultValue={PLAYER_AMBIENT_GLOW_SATURATE_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Насыщенность подсветки"
                  onChange={(saturate) => onAmbientGlowSettingsChange({ saturate })}
                />
                <AmbientGlowRange
                  label="Масштаб"
                  valueLabel={`${ambientGlowSettings.scale.toFixed(2)}×`}
                  min={PLAYER_AMBIENT_GLOW_SCALE_MIN}
                  max={PLAYER_AMBIENT_GLOW_SCALE_MAX}
                  step={PLAYER_AMBIENT_GLOW_SCALE_STEP}
                  value={ambientGlowSettings.scale}
                  defaultValue={PLAYER_AMBIENT_GLOW_SCALE_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Масштаб подсветки"
                  onChange={(scale) => onAmbientGlowSettingsChange({ scale })}
                />

                <p className="px-0.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                  Производительность
                </p>
                <AmbientGlowRange
                  label="Качество"
                  valueLabel={`${ambientGlowSettings.downscale.toFixed(2)}×`}
                  min={PLAYER_AMBIENT_GLOW_DOWNSCALE_MIN}
                  max={PLAYER_AMBIENT_GLOW_DOWNSCALE_MAX}
                  step={PLAYER_AMBIENT_GLOW_DOWNSCALE_STEP}
                  value={ambientGlowSettings.downscale}
                  defaultValue={PLAYER_AMBIENT_GLOW_DOWNSCALE_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Качество сэмпла подсветки"
                  onChange={(downscale) => onAmbientGlowSettingsChange({ downscale })}
                />
                <AmbientGlowRange
                  label="Интервал"
                  valueLabel={`${Math.round(ambientGlowSettings.updateIntervalMs)}мс`}
                  min={PLAYER_AMBIENT_GLOW_UPDATE_MS_MIN}
                  max={PLAYER_AMBIENT_GLOW_UPDATE_MS_MAX}
                  step={PLAYER_AMBIENT_GLOW_UPDATE_MS_STEP}
                  value={ambientGlowSettings.updateIntervalMs}
                  defaultValue={PLAYER_AMBIENT_GLOW_UPDATE_MS_DEFAULT}
                  disabled={!ambientEnabled}
                  ariaLabel="Интервал обновления подсветки"
                  onChange={(updateIntervalMs) =>
                    onAmbientGlowSettingsChange({ updateIntervalMs })
                  }
                />
                <button
                  type="button"
                  disabled={!ambientEnabled}
                  title="Сбросить все параметры"
                  aria-label="Сбросить все параметры подсветки"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    onAmbientGlowSettingsChange({
                      ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS,
                      enabled: ambientGlowSettings.enabled,
                    })
                  }
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconAmbientGlowReset />
                  <span>Сбросить всё</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {videoFitAvailable && onVideoFitToggle ? (
          <ControlButton
            label={videoFitLabel}
            disabled={disabled || videoFitDisabled}
            pressed={videoFit === "cover"}
            onClick={onVideoFitToggle}
            className="kodik-player-beta-video-fit-button"
          >
            <IconVideoFit fit={videoFit} />
          </ControlButton>
        ) : null}

        <ControlButton
          label={theaterLabel}
          disabled={disabled}
          pressed={theaterMode !== "normal"}
          onClick={onTheaterToggle}
          className="kodik-player-beta-theater-button"
        >
          <IconTheater mode={theaterMode} />
        </ControlButton>
      </div>
    </>
  );

  const rightControls = (
    <ControlButton
      label={fullscreenActive ? "Выйти из полноэкранного режима" : "На весь экран"}
      disabled={disabled}
      pressed={fullscreenActive}
      onClick={onFullscreenToggle}
      className="kodik-player-beta-fullscreen-button"
    >
      <IconFullscreen active={fullscreenActive} />
    </ControlButton>
  );

  const translationsToggle = fullscreenActive && onFullscreenTranslationsToggle ? (
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
  ) : null;

  if (qualitySplit) {
    return (
      <div
        className={[
          "kodik-player-beta-controls relative text-white",
          "pointer-events-none",
          overlay ? "rounded-none border-0" : "",
        ].join(" ")}
      >
        <div className="flex items-stretch gap-[clamp(2.5rem,6vw,5rem)] px-2 pb-2 sm:px-3">
          <div className={["pointer-events-auto min-w-0 flex-1 px-2 py-1.5 sm:px-3 -mr-6", panelClass].join(" ")}>
            {progressBar}
            <div className="kodik-player-beta-controls-row flex items-center gap-1 sm:gap-2">
              {leftControls}
            </div>
          </div>
          <div
            className={[
              "pointer-events-auto relative flex shrink-0 items-center self-stretch pl-6 pr-1",
              panelClass,
            ].join(" ")}
          >
            <span className="invisible" aria-hidden>
              {rightControls}
            </span>
            <div className="pointer-events-auto absolute inset-0 flex items-center justify-center">
              {rightControls}
            </div>
          </div>
        </div>
        {translationsToggle}
      </div>
    );
  }

  return (
    <div
      className={[
        "kodik-player-beta-controls relative px-2 py-1.5 text-white sm:px-3",
        interactive ? "pointer-events-auto" : "pointer-events-none",
        overlay
          ? "kodik-player-beta-controls--overlay rounded-none border-0 pb-2"
          : "rounded-b-lg border border-t-0 border-border bg-[#0f0f0f]",
      ].join(" ")}
    >
      {progressBar}
      <div className="kodik-player-beta-controls-row flex items-center gap-1 sm:gap-2">
        {leftControls}
        {qualityButton}
        {rightControls}
      </div>
      {translationsToggle}
    </div>
  );
}
