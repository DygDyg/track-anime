"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  KodikPlayer,
  type KodikPlayerHandle,
  type KodikPlayerPlaybackState,
  type KodikPlayerResume,
} from "@/components/anime/KodikPlayer";
import { KodikPlayerBetaControls } from "@/components/anime/KodikPlayerBetaControls";
import { KodikPlayerBetaEpisodeStrip } from "@/components/anime/KodikPlayerBetaEpisodeStrip";
import type { KodikStreamQuality } from "@/lib/kodik-player-quality";

const CONTROLS_IDLE_MS = 2_500;

type Props = {
  playerRef: RefObject<KodikPlayerHandle | null>;
  playerKey: string;
  src: string;
  title: string;
  sizeMode: "default" | "viewport";
  initialResume?: KodikPlayerResume | null;
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  currentEpisode: number;
  playback: KodikPlayerPlaybackState;
  qualities: KodikStreamQuality[];
  currentQuality: string | null;
  fullscreenActive: boolean;
  seekSkipLabelSeconds: number;
  controlsDisabled?: boolean;
  continueOverlay?: ReactNode;
  onReady?: () => void;
  onContinueStateChange?: (active: boolean) => void;
  onProgress?: (payload: {
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  }) => void;
  onPause?: (payload: {
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  }) => void;
  onTranslationChange?: (translation: { id: number; title: string }) => void;
  onPlaybackStateChange?: (state: KodikPlayerPlaybackState) => void;
  onEpisodeSelect: (episodeNumber: number) => void;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onSeekSkip: (deltaSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onQualityChange: (quality: KodikStreamQuality) => void;
  onFullscreenToggle: () => void;
};

export function KodikPlayerBetaViewport({
  playerRef,
  playerKey,
  src,
  title,
  sizeMode,
  initialResume,
  shikimoriId,
  kodikId,
  seasonNumber,
  currentEpisode,
  playback,
  qualities,
  currentQuality,
  fullscreenActive,
  seekSkipLabelSeconds,
  controlsDisabled = false,
  continueOverlay,
  onReady,
  onContinueStateChange,
  onProgress,
  onPause,
  onTranslationChange,
  onPlaybackStateChange,
  onEpisodeSelect,
  onPlayPause,
  onSeek,
  onSeekSkip,
  onVolumeChange,
  onMuteToggle,
  onQualityChange,
  onFullscreenToggle,
}: Props) {
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!playback.isPlaying || controlsDisabled) return;
    hideTimerRef.current = window.setTimeout(() => {
      setUiVisible(false);
      hideTimerRef.current = null;
    }, CONTROLS_IDLE_MS);
  }, [clearHideTimer, controlsDisabled, playback.isPlaying]);

  const revealUi = useCallback(() => {
    setUiVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (!playback.isPlaying || controlsDisabled) {
      clearHideTimer();
      setUiVisible(true);
      return;
    }
    scheduleHide();
    return clearHideTimer;
  }, [clearHideTimer, controlsDisabled, playback.isPlaying, scheduleHide]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return (
    <div
      className="kodik-player-beta-viewport relative min-w-0"
      onMouseMove={revealUi}
      onTouchStart={revealUi}
      onFocusCapture={revealUi}
    >
      {continueOverlay}
      <KodikPlayer
        ref={playerRef}
        key={playerKey}
        src={src}
        title={title}
        sizeMode={sizeMode}
        chromelessBeta
        initialResume={initialResume}
        onReady={onReady}
        onContinueStateChange={onContinueStateChange}
        onProgress={onProgress}
        onPause={onPause}
        onTranslationChange={onTranslationChange}
        onPlaybackStateChange={onPlaybackStateChange}
      />
      <div
        className={[
          "kodik-player-beta-ui pointer-events-none absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300",
          uiVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-hidden={!uiVisible}
      >
        <div className="kodik-player-beta-ui-top pointer-events-auto">
          <KodikPlayerBetaEpisodeStrip
            shikimoriId={shikimoriId}
            kodikId={kodikId}
            seasonNumber={seasonNumber}
            currentEpisode={currentEpisode}
            disabled={controlsDisabled}
            onSelect={onEpisodeSelect}
            overlay
          />
        </div>
        <div className="kodik-player-beta-ui-bottom pointer-events-auto">
          <KodikPlayerBetaControls
            disabled={controlsDisabled}
            playback={playback}
            qualities={qualities}
            currentQuality={currentQuality}
            fullscreenActive={fullscreenActive}
            seekSkipLabelSeconds={seekSkipLabelSeconds}
            overlay
            onPlayPause={onPlayPause}
            onSeek={onSeek}
            onSeekSkip={onSeekSkip}
            onVolumeChange={onVolumeChange}
            onMuteToggle={onMuteToggle}
            onQualityChange={onQualityChange}
            onFullscreenToggle={onFullscreenToggle}
          />
        </div>
      </div>
    </div>
  );
}
